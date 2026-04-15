import os
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone, timedelta
from fastapi import FastAPI, HTTPException, Query, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from fastapi.responses import StreamingResponse
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from backend.models import (
    PixRequest, PixResponse, UserGoalsRequest, UserStatusResponse,
    WebhookPixRequest, WebhookPixResponse, TransactionsResponse, TransactionItem,
    BankConnection, BankConnectionListResponse, AddBankConnectionRequest,
    CheckoutSessionRequest, CheckoutSessionResponse,
    PluggyTokenResponse, PluggyWebhookPayload,
    MonthlyCloseResponse, MonthlyHistoryResponse, MonthlyHistoryItem,

    BalanceTotalResponse,
    DashboardSummaryResponse,
)
from backend.storage import (
    get_balances, save_balances, get_user_status, upsert_goals, save_consent,
    is_transaction_processed, log_transaction, get_recent_transactions, set_premium,
    list_bank_connections, add_bank_connection, deactivate_bank_connection,
    save_monthly_summary, get_monthly_summary, create_monthly_snapshot,
    get_top_transactions_for_month, get_total_income_for_month,
    get_all_premium_users, get_monthly_history,
    reset_monthly_flow,
)
from backend.auth import get_token_user_id, assert_owns_resource
from backend.stripe_billing import (
    create_checkout_session, construct_webhook_event, retrieve_checkout_session,
)
from backend.pluggy_service import generate_connect_token, fetch_account_balances

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# ─── Scheduler: fechamento automático no dia 01 de cada mês ──────────────────

async def _run_monthly_close_all_users():
    """
    Job executado às 00:00 do dia 01 de cada mês (UTC).
    Para cada usuário premium:
      1. create_monthly_snapshot — lê saldos + transações e persiste em monthly_summaries.
      2. reset_monthly_flow     — zera Salário e Contas (Reserva intacta).
    """
    now = datetime.now(timezone.utc)
    first_of_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    last_month_end = first_of_month - timedelta(seconds=1)
    reference_month = last_month_end.strftime("%Y-%m")

    logger.info(f"[Scheduler] Iniciando fechamento automático: mês={reference_month}")

    try:
        user_ids = get_all_premium_users()
    except Exception as e:
        logger.error(f"[Scheduler] Falha ao buscar usuários premium: {e}")
        return

    logger.info(f"[Scheduler] Usuários premium encontrados: {len(user_ids)}")

    ok = 0
    for uid in user_ids:
        try:
            create_monthly_snapshot(uid, reference_month)
            ok += 1
            logger.info(f"[Scheduler] Snapshot + reset OK: user='{uid}' mês='{reference_month}'")
        except Exception as e:
            logger.error(f"[Scheduler] Erro ao fechar mês para user='{uid}': {e}")

    logger.info(f"[Scheduler] Fechamento automático concluído: {ok}/{len(user_ids)} usuário(s).")


@asynccontextmanager
async def lifespan(application: FastAPI):
    scheduler = AsyncIOScheduler(timezone="America/Sao_Paulo")
    scheduler.add_job(
        _run_monthly_close_all_users,
        CronTrigger(day=1, hour=0, minute=0, timezone="America/Sao_Paulo"),
        id="monthly_close",
        name="Fechamento Mensal Automático",
        replace_existing=True,
    )
    scheduler.start()
    logger.info("[Scheduler] APScheduler iniciado — fechamento automático no dia 01/mês às 00:00 America/Sao_Paulo.")
    yield
    scheduler.shutdown(wait=False)
    logger.info("[Scheduler] APScheduler encerrado.")


from backend.routes.demo import router as demo_router

app = FastAPI(title="Lupe Flow API", lifespan=lifespan)

_allowed_origins = [
    "https://lupe-flow-micro-entrepreneur-mvp.vercel.app",
    "http://localhost:5000",
    "http://localhost:3000",
]
_replit_domain = os.getenv("REPLIT_DEV_DOMAIN", "")
if _replit_domain:
    _allowed_origins.append(f"https://{_replit_domain}")
_frontend_url = os.getenv("FRONTEND_URL", "")
if _frontend_url:
    origin = _frontend_url.rstrip("/")
    if origin not in _allowed_origins:
        _allowed_origins.append(origin)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(demo_router)


# ─── Helpers ────────────────────────────────────────────────────────────────

def _apply_split(valor: float, balance):
    """Apply 30/50/20 split with overflow routing to emergency. Returns (new_balance, allocs)."""
    base_salary    = valor * 0.30
    base_bills     = valor * 0.50
    base_emergency = valor * 0.20
    overflow       = 0.0

    new_salary = balance.salary + base_salary
    if new_salary > balance.salary_goal:
        overflow  += new_salary - balance.salary_goal
        new_salary = balance.salary_goal

    new_bills = balance.bills + base_bills
    if new_bills > balance.bills_goal:
        overflow += new_bills - balance.bills_goal
        new_bills = balance.bills_goal

    alloc_salary    = new_salary - balance.salary
    alloc_bills     = new_bills  - balance.bills
    alloc_emergency = base_emergency + overflow
    new_emergency   = balance.emergency + alloc_emergency

    balance.salary    = new_salary
    balance.bills     = new_bills
    balance.emergency = new_emergency

    return balance, {
        "alloc_salary":    round(alloc_salary, 2),
        "alloc_bills":     round(alloc_bills, 2),
        "alloc_emergency": round(alloc_emergency, 2),
        "overflow":        round(overflow, 2),
    }


# ─── Health ──────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok"}


# ─── Supabase public config (safe — anon key is meant to be public) ──────────

@app.get("/config/supabase")
def supabase_config():
    return {
        "url": os.getenv("SUPABASE_URL", ""),
        "anon_key": os.getenv("SUPABASE_ANON_KEY", ""),
    }


# ─── User (read — JWT required) ──────────────────────────────────────────────

@app.get("/usuario/{user_id}", response_model=UserStatusResponse)
def check_usuario(
    user_id: str,
    token_user_id: str = Depends(get_token_user_id),
):
    assert_owns_resource(token_user_id, user_id)
    status = get_user_status(user_id)
    return UserStatusResponse(**status)


# ─── User goals (write — JWT required) ───────────────────────────────────────

@app.post("/usuario/{user_id}/metas")
def salvar_metas(
    user_id: str,
    req: UserGoalsRequest,
    token_user_id: str = Depends(get_token_user_id),
):
    assert_owns_resource(token_user_id, user_id)
    if req.salary_goal <= 0 or req.bills_goal <= 0 or req.emergency_goal <= 0:
        raise HTTPException(status_code=422, detail="Todas as metas devem ser maiores que zero.")
    upsert_goals(user_id, req.salary_goal, req.bills_goal, req.emergency_goal)
    return {"message": "Metas salvas com sucesso."}


# ─── LGPD consent (write — JWT required) ─────────────────────────────────────

@app.post("/usuario/{user_id}/consent")
def salvar_consent(
    user_id: str,
    token_user_id: str = Depends(get_token_user_id),
):
    assert_owns_resource(token_user_id, user_id)
    saved_to_db = save_consent(user_id)
    return {"message": "Consentimento LGPD registrado.", "persisted": saved_to_db}


# ─── Premium activation (write — JWT required) ───────────────────────────────

@app.post("/usuario/{user_id}/premium")
def ativar_premium(
    user_id: str,
    token_user_id: str = Depends(get_token_user_id),
):
    """
    Activates the premium plan for the authenticated user.
    JWT must belong to the same user_id in the path.
    set_premium uses UPDATE if the row exists so balances are NEVER overwritten.
    """
    assert_owns_resource(token_user_id, user_id)
    try:
        set_premium(user_id, True)
        return {"message": "Assinatura Premium ativada com sucesso.", "is_premium": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error activating premium for user '{user_id}': {e}", exc_info=True)
        raise HTTPException(status_code=503, detail=f"Erro inesperado ao ativar assinatura: {e}")


@app.delete("/usuario/{user_id}/premium")
def cancelar_premium(
    user_id: str,
    token_user_id: str = Depends(get_token_user_id),
):
    assert_owns_resource(token_user_id, user_id)
    set_premium(user_id, False)
    return {"message": "Assinatura cancelada.", "is_premium": False}


# ─── Balances (read — JWT required) ──────────────────────────────────────────

@app.get("/saldos", response_model=PixResponse)
def get_saldos(
    token_user_id: str = Depends(get_token_user_id),
    salary_goal: float = Query(default=3000.0),
    bills_goal: float = Query(default=1500.0),
    emergency_goal: float = Query(default=10000.0),
):
    defaults = {
        "salary_goal": salary_goal,
        "bills_goal": bills_goal,
        "emergency_goal": emergency_goal,
    }
    balance = get_balances(token_user_id, defaults)
    return PixResponse(
        salary=round(balance.salary, 2),
        bills=round(balance.bills, 2),
        emergency=round(balance.emergency, 2),
        salary_goal=balance.salary_goal,
        bills_goal=balance.bills_goal,
        emergency_goal=balance.emergency_goal,
        allocated_salary=0.0,
        allocated_bills=0.0,
        allocated_emergency=0.0,
        overflow=0.0,
    )


# ─── Transactions feed (read — JWT required) ──────────────────────────────────

@app.get("/transactions", response_model=TransactionsResponse)
def get_transactions(
    token_user_id: str = Depends(get_token_user_id),
    limit: int = Query(default=10, le=50),
):
    rows = get_recent_transactions(token_user_id, limit)
    items = [
        TransactionItem(
            id=str(r.get("id", "")),
            user_id=r.get("user_id", ""),
            amount=float(r.get("amount", 0)),
            category=r.get("category", ""),
            description=r.get("description"),
            external_id=r.get("external_id"),
            created_at=str(r.get("created_at", "")),
        )
        for r in rows
    ]
    return TransactionsResponse(transactions=items)


# ─── Webhook — Open Finance entry point (server-to-server, no user JWT) ───────

@app.post("/v1/webhook/pix", response_model=WebhookPixResponse)
def webhook_pix(req: WebhookPixRequest, request: Request):
    """
    Receives PIX webhook events from Open Finance providers.
    Validates the shared secret header before processing.
    user_id must be in the request body — not in query params.
    """
    webhook_secret = os.getenv("WEBHOOK_PIX_SECRET", "").strip()
    if webhook_secret:
        incoming = request.headers.get("X-Webhook-Secret", "").strip()
        if not incoming or incoming != webhook_secret:
            raise HTTPException(status_code=401, detail="Webhook secret inválido.")

    user_id = req.user_id.strip()
    if not user_id:
        raise HTTPException(status_code=422, detail="user_id é obrigatório no corpo da requisição.")

    if req.valor <= 0:
        raise HTTPException(status_code=422, detail="O valor do Pix deve ser maior que zero.")

    if is_transaction_processed(req.id_transacao_bancaria):
        logger.info(f"Duplicate webhook ignored: {req.id_transacao_bancaria}")
        return WebhookPixResponse(
            status="ok",
            message="Transação já processada anteriormente (idempotente).",
            idempotent=True,
        )

    balance = get_balances(user_id, {})
    balance, allocs = _apply_split(req.valor, balance)
    save_balances(user_id, balance)

    base_desc = req.descricao.strip() or "Pix Recebido"

    if allocs["alloc_salary"] > 0:
        log_transaction(
            user_id=user_id,
            amount=allocs["alloc_salary"],
            category="salario",
            description=base_desc,
            external_id=req.id_transacao_bancaria,
        )
    if allocs["alloc_bills"] > 0:
        log_transaction(user_id=user_id, amount=allocs["alloc_bills"], category="contas", description=base_desc)
    if allocs["alloc_emergency"] > 0:
        log_transaction(user_id=user_id, amount=allocs["alloc_emergency"], category="reserva", description=base_desc)

    logger.info(
        f"Webhook processed: user={user_id} valor={req.valor} "
        f"salary={allocs['alloc_salary']} bills={allocs['alloc_bills']} "
        f"emergency={allocs['alloc_emergency']} overflow={allocs['overflow']}"
    )

    return WebhookPixResponse(
        status="ok",
        message=f"PIX de R$ {req.valor:.2f} processado e distribuído com sucesso.",
        idempotent=False,
        salary=round(balance.salary, 2),
        bills=round(balance.bills, 2),
        emergency=round(balance.emergency, 2),
        overflow=allocs["overflow"],
    )


# ─── Bank Connections (all write — JWT required) ──────────────────────────────

@app.get("/usuario/{user_id}/banks", response_model=BankConnectionListResponse)
def get_banks(
    user_id: str,
    token_user_id: str = Depends(get_token_user_id),
):
    """
    List all bank connections for the authenticated user.
    Returns active + inactive rows and the count of extra billable units.
    """
    assert_owns_resource(token_user_id, user_id)
    rows = list_bank_connections(user_id)
    connections = [
        BankConnection(
            id=str(r["id"]),
            user_id=r["user_id"],
            bank_name=r["bank_name"],
            status=r["status"],
            provider_id=r.get("provider_id"),
            activated_at=str(r.get("activated_at", "")),
            deactivated_at=str(r["deactivated_at"]) if r.get("deactivated_at") else None,
        )
        for r in rows
    ]
    return BankConnectionListResponse(connections=connections, billable_units=0)


@app.post("/usuario/{user_id}/banks", response_model=BankConnection)
def create_bank(
    user_id: str,
    req: AddBankConnectionRequest,
    token_user_id: str = Depends(get_token_user_id),
):
    """
    Add a new active bank connection for the authenticated user.
    Returns the created connection row.
    """
    assert_owns_resource(token_user_id, user_id)
    if not req.bank_name.strip():
        raise HTTPException(status_code=422, detail="O nome do banco não pode estar vazio.")
    row = add_bank_connection(user_id, req.bank_name.strip(), req.provider_id)
    return BankConnection(
        id=str(row["id"]),
        user_id=row["user_id"],
        bank_name=row["bank_name"],
        status=row["status"],
        provider_id=row.get("provider_id"),
        activated_at=str(row.get("activated_at", "")),
        deactivated_at=None,
    )


@app.delete("/usuario/{user_id}/banks/{connection_id}", response_model=BankConnection)
def remove_bank(
    user_id: str,
    connection_id: str,
    token_user_id: str = Depends(get_token_user_id),
):
    """
    Soft-delete a bank connection: sets status='inactive' and records deactivated_at.
    Row is preserved for billing cycle calculations.
    """
    assert_owns_resource(token_user_id, user_id)
    row = deactivate_bank_connection(user_id, connection_id)
    return BankConnection(
        id=str(row["id"]),
        user_id=row["user_id"],
        bank_name=row["bank_name"],
        status=row["status"],
        provider_id=row.get("provider_id"),
        activated_at=str(row.get("activated_at", "")),
        deactivated_at=str(row["deactivated_at"]) if row.get("deactivated_at") else None,
    )


# ─── Pix real entry (write — JWT required) ────────────────────────────────────

@app.post("/dividir-pix", response_model=PixResponse)
def dividir_pix(
    req: PixRequest,
    token_user_id: str = Depends(get_token_user_id),
):
    """
    Premium-only: persists a real PIX split to Supabase.
    JWT must belong to the same user_id present in the request body.
    """
    assert_owns_resource(token_user_id, req.user_id)

    if req.valor_pix <= 0:
        raise HTTPException(status_code=400, detail="O valor do Pix deve ser maior que zero.")

    defaults = {
        "salary_goal": req.salary_goal or 3000.0,
        "bills_goal":  req.bills_goal  or 1500.0,
        "emergency_goal": req.emergency_goal or 10000.0,
    }

    balance = get_balances(req.user_id, defaults)

    old_salary    = balance.salary
    old_bills     = balance.bills
    old_emergency = balance.emergency

    balance, allocs = _apply_split(req.valor_pix, balance)
    save_balances(req.user_id, balance)

    description = (req.description or "").strip() or "Pix Simulado"
    try:
        if allocs["alloc_salary"] > 0:
            log_transaction(req.user_id, allocs["alloc_salary"], "salario", description)
        if allocs["alloc_bills"] > 0:
            log_transaction(req.user_id, allocs["alloc_bills"], "contas", description)
        if allocs["alloc_emergency"] > 0:
            log_transaction(req.user_id, allocs["alloc_emergency"], "reserva", description)
    except Exception as exc:
        logger.error(f"Transaction log failed for {req.user_id}, rolling back: {exc}")
        try:
            balance.salary    = old_salary
            balance.bills     = old_bills
            balance.emergency = old_emergency
            save_balances(req.user_id, balance)
        except Exception as rb_exc:
            logger.error(f"Rollback also failed: {rb_exc}")
        raise HTTPException(
            status_code=503,
            detail="Erro ao registrar a transação. Saldo restaurado automaticamente.",
        )

    return PixResponse(
        salary=round(balance.salary, 2),
        bills=round(balance.bills, 2),
        emergency=round(balance.emergency, 2),
        salary_goal=balance.salary_goal,
        bills_goal=balance.bills_goal,
        emergency_goal=balance.emergency_goal,
        allocated_salary=allocs["alloc_salary"],
        allocated_bills=allocs["alloc_bills"],
        allocated_emergency=allocs["alloc_emergency"],
        overflow=allocs["overflow"],
    )


# ─── Stripe Checkout (write — JWT required) ───────────────────────────────────

@app.get("/checkout/verify-session")
def verify_checkout_session(
    session_id: str = Query(...),
    token_user_id: str = Depends(get_token_user_id),
):
    """
    Validates a Stripe Checkout Session by ID.
    Ensures the session belongs to the authenticated user before confirming payment.
    Prevents premium activation via direct URL manipulation.
    """
    try:
        session = retrieve_checkout_session(session_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Sessão inválida ou não encontrada: {e}")

    client_ref = (str(getattr(session, "client_reference_id", "") or "")).strip()
    raw_meta   = getattr(session, "metadata", None)
    metadata: dict = {}
    if raw_meta:
        metadata = dict(raw_meta) if isinstance(raw_meta, dict) else {k: raw_meta[k] for k in raw_meta}

    session_user_id = client_ref or (metadata.get("user_id") or "").strip()
    if session_user_id != token_user_id:
        raise HTTPException(status_code=403, detail="Sessão não pertence ao usuário autenticado.")

    payment_status = str(getattr(session, "payment_status", "") or "").strip()
    plan_type      = (metadata.get("plan_type") or "premium").strip()

    return {
        "session_id":     session_id,
        "payment_status": payment_status,
        "plan_type":      plan_type,
        "user_id":        session_user_id,
        "verified":       payment_status in ("paid", "no_payment_required"),
    }


@app.post("/checkout/create-session", response_model=CheckoutSessionResponse)
def create_stripe_session(
    req: CheckoutSessionRequest,
    token_user_id: str = Depends(get_token_user_id),
):
    """
    Create a Stripe Checkout Session for the authenticated user.
    Calculates total based on plan_cycle and current billable bank connections.
    Returns the Stripe-hosted checkout URL for client-side redirect.
    """
    assert_owns_resource(token_user_id, req.user_id)

    if req.plan_cycle not in ("monthly", "yearly"):
        raise HTTPException(
            status_code=422,
            detail="plan_cycle deve ser 'monthly' ou 'yearly'.",
        )

    try:
        checkout_url = create_checkout_session(req.user_id, req.plan_cycle)
    except ValueError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        logger.error(f"Stripe session error for user '{req.user_id}': {e}", exc_info=True)
        raise HTTPException(status_code=503, detail=f"Erro ao criar sessão de pagamento: {e}")

    return CheckoutSessionResponse(checkout_url=checkout_url)


# ─── Stripe Webhook (server-to-server — no user JWT) ─────────────────────────

@app.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    """
    Receives Stripe webhook events (checkout.session.completed, etc.).
    Verifies the signature with STRIPE_WEBHOOK_SECRET, then activates premium
    for the user referenced in client_reference_id / metadata.user_id.
    This endpoint is called by Stripe servers — not by the frontend.
    """
    payload    = await request.body()
    sig_header = request.headers.get("Stripe-Signature", "")

    try:
        event = construct_webhook_event(payload, sig_header)
    except ValueError as e:
        logger.warning(f"Stripe webhook config error: {e}")
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        logger.warning(f"Stripe webhook signature invalid: {e}")
        raise HTTPException(status_code=400, detail="Assinatura do webhook inválida.")

    # StripeObject supports attribute access and bracket access but NOT .get() in all SDK versions.
    # Use getattr() for safety throughout this handler.
    event_type = getattr(event, "type", None) or ""
    logger.info(f"Stripe webhook received: type='{event_type}'")

    def _str(val) -> str:
        """Safely coerce a Stripe attribute value to a stripped string."""
        return (str(val) if val is not None else "").strip()

    def _meta(obj) -> dict:
        """Return metadata as a plain dict regardless of StripeObject or dict."""
        raw = getattr(obj, "metadata", None)
        if raw is None:
            return {}
        if isinstance(raw, dict):
            return raw
        # StripeObject — iterate its keys
        try:
            return {k: raw[k] for k in raw}
        except Exception:
            return {}

    if event_type == "checkout.session.completed":
        session        = event.data.object
        payment_status = _str(getattr(session, "payment_status", ""))
        # "paid"               = one-time or subscription first payment succeeded
        # "no_payment_required"= free-trial or 100%-off coupon — still grant premium
        payment_ok = payment_status in ("paid", "no_payment_required")

        client_ref = _str(getattr(session, "client_reference_id", ""))
        metadata   = _meta(session)
        meta_uid   = (metadata.get("user_id") or "").strip()
        user_id    = client_ref or meta_uid

        logger.info(
            f"[Webhook] checkout.session.completed — "
            f"payment_status='{payment_status}' payment_ok={payment_ok} "
            f"client_reference_id='{client_ref}' metadata.user_id='{meta_uid}' "
            f"resolved_user_id='{user_id}'"
        )

        if not user_id:
            session_id = _str(getattr(session, "id", ""))
            logger.error(
                f"[Webhook] ERRO: user_id não encontrado no evento Stripe. "
                f"session_id='{session_id}' metadata={metadata}"
            )
            return {"received": True}

        if not payment_ok:
            logger.warning(
                f"[Webhook] checkout.session.completed ignorado — "
                f"payment_status='{payment_status}' user_id='{user_id}'"
            )
            return {"received": True}

        plan_cycle = (metadata.get("plan_cycle") or "monthly").strip()

        # Activate premium
        try:
            set_premium(user_id, True)
            logger.info(f"[Webhook] set_premium(True) OK — user='{user_id}'")
        except Exception as e:
            logger.error(f"[Webhook] set_premium FALHOU para '{user_id}': {e}", exc_info=True)
            raise HTTPException(status_code=500, detail="Erro ao ativar premium.")

        # Persist plan_cycle (non-fatal)
        try:
            from backend.storage import get_supabase
            sb = get_supabase()
            res = (
                sb.table("user_balances")
                  .update({"plan_cycle": plan_cycle})
                  .eq("user_id", user_id)
                  .execute()
            )
            logger.info(
                f"[Webhook] plan_cycle='{plan_cycle}' persistido — "
                f"user='{user_id}' rows_affected={len(res.data or [])}"
            )
        except Exception as sb_e:
            logger.warning(f"[Webhook] Falha ao persistir plan_cycle para '{user_id}': {sb_e}")

        logger.info(f"[Webhook] Checkout processado — user='{user_id}' plan='{plan_cycle}'")

    elif event_type == "customer.subscription.deleted":
        session  = event.data.object
        metadata = _meta(session)
        user_id  = (metadata.get("user_id") or "").strip()
        logger.info(f"[Webhook] customer.subscription.deleted — user_id='{user_id}'")
        if user_id:
            try:
                set_premium(user_id, False)
                logger.info(f"[Webhook] Premium cancelado — user='{user_id}'")
            except Exception as e:
                logger.error(f"[Webhook] Falha ao cancelar premium para '{user_id}': {e}", exc_info=True)
        else:
            logger.warning("[Webhook] customer.subscription.deleted sem user_id no metadata.")

    elif event_type == "invoice.payment_failed":
        invoice  = event.data.object
        metadata = _meta(invoice)
        user_id  = (metadata.get("user_id") or "").strip()
        logger.info(f"[Webhook] invoice.payment_failed — user_id='{user_id}'")
        if user_id:
            try:
                set_premium(user_id, False)
                logger.info(f"[Webhook] Premium desativado por inadimplência — user='{user_id}'")
            except Exception as e:
                logger.error(f"[Webhook] Falha ao desativar premium por inadimplência para '{user_id}': {e}", exc_info=True)
        else:
            logger.warning("[Webhook] invoice.payment_failed sem user_id no metadata.")

    return {"received": True}


# ─── Pluggy Open Banking — Connect Token (JWT required) ───────────────────────

@app.get("/dashboard/summary", response_model=DashboardSummaryResponse)
def get_dashboard_summary(
    token_user_id: str = Depends(get_token_user_id),
):
    """
    Returns the combined balance for the Dashboard header:
    - manual_boxes_balance: salary + bills + emergency from Supabase
    - bank_balance: sum of all real account balances from active Pluggy connections
    - total_balance: manual_boxes_balance + bank_balance
    bank_balance is 0 if no banks are connected or Pluggy is unavailable.
    """
    balance = get_balances(token_user_id, {})
    manual_boxes_balance = round(balance.salary + balance.bills + balance.emergency, 2)

    connections = list_bank_connections(token_user_id)
    provider_ids = [
        c["provider_id"] for c in connections
        if c.get("status") == "active" and c.get("provider_id")
    ]
    bank_balance = fetch_account_balances(provider_ids)

    return DashboardSummaryResponse(
        total_balance=round(manual_boxes_balance + bank_balance, 2),
        bank_balance=bank_balance,
        manual_boxes_balance=manual_boxes_balance,
    )


@app.get("/balance/total", response_model=BalanceTotalResponse)
def get_balance_total(
    token_user_id: str = Depends(get_token_user_id),
):
    """
    Returns the combined balance:
    - boxes_total: salary + bills + emergency from Supabase
    - pluggy_total: sum of all Pluggy account balances for active connections
    - grand_total: boxes_total + pluggy_total
    If no banks are connected or Pluggy fails, pluggy_total = 0.
    """
    balance = get_balances(token_user_id, {})
    boxes_total = round(balance.salary + balance.bills + balance.emergency, 2)

    connections = list_bank_connections(token_user_id)
    provider_ids = [
        c["provider_id"] for c in connections
        if c.get("status") == "active" and c.get("provider_id")
    ]
    pluggy_total = fetch_account_balances(provider_ids)

    return BalanceTotalResponse(
        boxes_total=boxes_total,
        pluggy_total=pluggy_total,
        grand_total=round(boxes_total + pluggy_total, 2),
    )


@app.get("/pluggy/token", response_model=PluggyTokenResponse)
def get_pluggy_token(
    token_user_id: str = Depends(get_token_user_id),
):
    """
    Generate a Pluggy Connect Token for the authenticated user.
    Requires is_premium. Only 1 bank connection is allowed per plan.
    """
    all_connections = list_bank_connections(token_user_id)
    active_count = sum(1 for c in all_connections if c.get("status") == "active")

    if active_count >= 1:
        raise HTTPException(status_code=403, detail="Limite de 1 conexão bancária atingido.")

    connect_token = generate_connect_token(token_user_id)
    return PluggyTokenResponse(connect_token=connect_token)


# ─── Pluggy Webhook (server-to-server — no user JWT) ─────────────────────────

@app.post("/webhook")
async def pluggy_webhook(payload: PluggyWebhookPayload):
    """
    Receives Pluggy webhook events (transactions/created, etc.).
    Extracts user_id from data.item.clientUserId (set when generating the connect token).
    Saves each transaction to public.transactions in Supabase.
    """
    event = payload.event or ""
    logger.info(f"Pluggy webhook received: event='{event}' itemId='{payload.itemId}'")

    if event not in ("transactions/created", "transactions/updated", "transactions.updates"):
        logger.info(f"Pluggy webhook ignored: event='{event}'")
        return {"received": True, "processed": 0}

    data = payload.data
    if not data or not data.item:
        logger.warning("Pluggy webhook: 'data' or 'data.item' missing — ignoring.")
        return {"received": True, "processed": 0}

    user_id = (data.item.clientUserId or "").strip()
    if not user_id:
        logger.warning("Pluggy webhook: 'clientUserId' is empty — cannot identify user.")
        return {"received": True, "processed": 0}

    transactions = data.transactions or []
    saved = 0

    for tx in transactions:
        tx_id     = tx.id or ""
        amount    = tx.amount
        desc      = (tx.description or "").strip() or "Transação Pluggy"
        category  = (tx.category or "outros").strip().lower()

        if amount is None:
            logger.warning(f"Pluggy webhook: transaction '{tx_id}' has no amount — skipping.")
            continue

        if tx_id and is_transaction_processed(tx_id):
            logger.info(f"Pluggy webhook: duplicate transaction '{tx_id}' — skipping (idempotent).")
            continue

        try:
            log_transaction(
                user_id=user_id,
                amount=abs(amount),
                category=category,
                description=desc,
                external_id=tx_id or None,
            )
            saved += 1
            logger.info(
                f"Pluggy webhook: saved tx '{tx_id}' user='{user_id}' "
                f"amount={amount} category='{category}'"
            )
        except Exception as e:
            logger.error(f"Pluggy webhook: failed to save tx '{tx_id}' for user '{user_id}': {e}")

    logger.info(f"Pluggy webhook done: event='{event}' user='{user_id}' saved={saved}/{len(transactions)}")
    return {"received": True, "processed": saved}


# ─── Monthly Close (write — JWT required, premium only) ───────────────────────

@app.post("/usuario/{user_id}/fechamento", response_model=MonthlyCloseResponse)
def fechar_mes(
    user_id: str,
    token_user_id: str = Depends(get_token_user_id),
    month: str = Query(
        default=None,
        description="Mês de referência no formato YYYY-MM. Padrão: mês anterior.",
    ),
):
    """
    Executa o fechamento mensal:
    1. Captura snapshot dos saldos atuais.
    2. Salva em monthly_summaries.
    3. Zera Salário e Contas. Reserva é preservada.
    Premium exclusivo.
    """
    assert_owns_resource(token_user_id, user_id)

    status = get_user_status(user_id)
    if not status.get("is_premium"):
        raise HTTPException(status_code=403, detail="Recurso exclusivo para assinantes Premium.")

    if not month:
        today = datetime.now(timezone.utc)
        first_of_month = today.replace(day=1)
        last_month = first_of_month - timedelta(days=1)
        month = last_month.strftime("%Y-%m")

    row = create_monthly_snapshot(user_id, month)

    return MonthlyCloseResponse(
        message=f"Fechamento de {month} realizado com sucesso.",
        reference_month=month,
        salary_snapshot=float(row.get("salary_snapshot", 0)),
        bills_snapshot=float(row.get("bills_snapshot", 0)),
        emergency_snapshot=float(row.get("emergency_snapshot", 0)),
        total_income=float(row.get("total_income", 0)),
    )


# ─── Monthly PDF Report (GET — JWT required, premium only) ────────────────────

@app.get("/usuario/{user_id}/historico/mensal", response_model=MonthlyHistoryResponse)
def historico_mensal(
    user_id: str,
    token_user_id: str = Depends(get_token_user_id),
    limit: int = Query(default=12, ge=1, le=36, description="Número máximo de meses. Padrão: 12."),
):
    """
    Retorna o histórico de fechamentos mensais do usuário para exibição
    comparativa no dashboard. Ordenado do mais recente ao mais antigo.
    Inclui variação percentual de faturamento mês a mês (income_variation_pct).
    Premium exclusivo.
    """
    assert_owns_resource(token_user_id, user_id)

    status = get_user_status(user_id)
    if not status.get("is_premium"):
        raise HTTPException(status_code=403, detail="Histórico mensal exclusivo para assinantes Premium.")

    rows = get_monthly_history(user_id, limit=limit)
    items = [MonthlyHistoryItem(**row) for row in rows]
    return MonthlyHistoryResponse(history=items, count=len(items))


@app.get("/usuario/{user_id}/relatorio/mensal")
def relatorio_mensal_pdf(
    user_id: str,
    token_user_id: str = Depends(get_token_user_id),
    month: str = Query(
        default=None,
        description="Mês de referência no formato YYYY-MM. Padrão: mês anterior.",
    ),
):
    """
    Gera e retorna o relatório PDF do mês informado.
    - Se houver um fechamento salvo (monthly_summaries), usa esses dados.
    - Caso contrário, usa os saldos atuais (útil para mês corrente).
    Premium exclusivo.
    """
    assert_owns_resource(token_user_id, user_id)

    status = get_user_status(user_id)
    if not status.get("is_premium"):
        raise HTTPException(status_code=403, detail="Relatório PDF exclusivo para assinantes Premium.")

    from backend.pdf_report import generate_monthly_pdf

    if not month:
        month = datetime.now(timezone.utc).strftime("%Y-%m")

    summary = get_monthly_summary(user_id, month)
    top_txs  = get_top_transactions_for_month(user_id, month, limit=5)

    if summary:
        salary_s    = float(summary.get("salary_snapshot", 0))
        bills_s     = float(summary.get("bills_snapshot", 0))
        emergency_s = float(summary.get("emergency_snapshot", 0))
        salary_g    = float(summary.get("salary_goal", 0))
        bills_g     = float(summary.get("bills_goal", 0))
        emergency_g = float(summary.get("emergency_goal", 0))
        total_in    = float(summary.get("total_income", 0))
    else:
        balance     = get_balances(user_id, {})
        salary_s    = balance.salary
        bills_s     = balance.bills
        emergency_s = balance.emergency
        salary_g    = balance.salary_goal
        bills_g     = balance.bills_goal
        emergency_g = balance.emergency_goal
        total_in    = get_total_income_for_month(user_id, month)

    try:
        pdf_bytes = generate_monthly_pdf(
            user_id=user_id,
            reference_month=month,
            salary_snapshot=salary_s,
            bills_snapshot=bills_s,
            emergency_snapshot=emergency_s,
            salary_goal=salary_g,
            bills_goal=bills_g,
            emergency_goal=emergency_g,
            total_income=total_in,
            top_transactions=top_txs,
            force_values=True,
        )
    except Exception as e:
        logger.error(f"PDF generation error for user '{user_id}': {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Erro ao gerar PDF: {e}")

    filename = f"lupeflow-relatorio-{month}.pdf"
    return StreamingResponse(
        iter([pdf_bytes]),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
