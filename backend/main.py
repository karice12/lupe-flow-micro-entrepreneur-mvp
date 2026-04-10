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
)
from backend.storage import (
    get_balances, save_balances, get_user_status, upsert_goals, save_consent,
    is_transaction_processed, log_transaction, get_recent_transactions, set_premium,
    list_bank_connections, add_bank_connection, deactivate_bank_connection, count_billable_units,
    save_monthly_summary, get_monthly_summary,
    get_top_transactions_for_month, get_total_income_for_month,
    get_all_premium_users, get_monthly_history,
)
from backend.auth import get_token_user_id, assert_owns_resource
from backend.stripe_billing import (
    create_checkout_session, construct_webhook_event,
)
from backend.pluggy_service import generate_connect_token

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# ─── Scheduler: fechamento automático no dia 01 de cada mês ──────────────────

async def _run_monthly_close_all_users():
    """
    Job executado às 00:05 do dia 01 de cada mês (UTC).
    Fecha o mês anterior para todos os usuários premium.
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

    for uid in user_ids:
        try:
            balance    = get_balances(uid, {})
            total_in   = get_total_income_for_month(uid, reference_month)
            save_monthly_summary(
                user_id=uid,
                reference_month=reference_month,
                salary_snapshot=balance.salary,
                bills_snapshot=balance.bills,
                emergency_snapshot=balance.emergency,
                salary_goal=balance.salary_goal,
                bills_goal=balance.bills_goal,
                emergency_goal=balance.emergency_goal,
                total_income=total_in,
            )
            logger.info(f"[Scheduler] Fechamento OK: user='{uid}' mês='{reference_month}'")
        except Exception as e:
            logger.error(f"[Scheduler] Erro ao fechar mês para user='{uid}': {e}")

    logger.info(f"[Scheduler] Fechamento automático concluído: {len(user_ids)} usuário(s).")


@asynccontextmanager
async def lifespan(application: FastAPI):
    scheduler = AsyncIOScheduler(timezone="UTC")
    scheduler.add_job(
        _run_monthly_close_all_users,
        CronTrigger(day=1, hour=0, minute=5, timezone="UTC"),
        id="monthly_close",
        name="Fechamento Mensal Automático",
        replace_existing=True,
    )
    scheduler.start()
    logger.info("[Scheduler] APScheduler iniciado — fechamento automático no dia 01/mês às 00:05 UTC.")
    yield
    scheduler.shutdown(wait=False)
    logger.info("[Scheduler] APScheduler encerrado.")


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
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


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


# ─── User (read-only — no JWT required) ──────────────────────────────────────

@app.get("/usuario/{user_id}", response_model=UserStatusResponse)
def check_usuario(user_id: str):
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


# ─── Balances (read — no JWT required; isolated by user_id server-side) ──────

@app.get("/saldos", response_model=PixResponse)
def get_saldos(
    user_id: str = Query(default="usuario_teste"),
    salary_goal: float = Query(default=3000.0),
    bills_goal: float = Query(default=1500.0),
    emergency_goal: float = Query(default=10000.0),
):
    defaults = {
        "salary_goal": salary_goal,
        "bills_goal": bills_goal,
        "emergency_goal": emergency_goal,
    }
    balance = get_balances(user_id, defaults)
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


# ─── Transactions feed (read) ─────────────────────────────────────────────────

@app.get("/transactions", response_model=TransactionsResponse)
def get_transactions(
    user_id: str = Query(default="usuario_teste"),
    limit: int = Query(default=10, le=50),
):
    rows = get_recent_transactions(user_id, limit)
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
def webhook_pix(req: WebhookPixRequest, user_id: str = Query(default="usuario_teste")):
    """
    Simulates what Pluggy / Belvo / Open Finance would POST when a PIX is received.
    Server-to-server call — authenticated via Supabase service role on the backend side.
    """
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
    extra = count_billable_units(user_id)
    return BankConnectionListResponse(connections=connections, billable_units=extra)


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

    extra_banks = count_billable_units(req.user_id)

    try:
        checkout_url = create_checkout_session(req.user_id, req.plan_cycle, extra_banks)
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

    event_type = event.get("type", "")
    logger.info(f"Stripe webhook received: type='{event_type}'")

    if event_type == "checkout.session.completed":
        session    = event["data"]["object"]
        payment_ok = session.get("payment_status") == "paid"
        user_id    = (
            session.get("client_reference_id")
            or (session.get("metadata") or {}).get("user_id")
        )

        if payment_ok and user_id:
            try:
                plan_cycle = (session.get("metadata") or {}).get("plan_cycle", "monthly")
                set_premium(user_id, True)
                # Persist plan_cycle if available
                sb = None
                try:
                    from backend.storage import get_supabase
                    sb = get_supabase()
                    sb.table("user_balances") \
                      .update({"plan_cycle": plan_cycle}) \
                      .eq("user_id", user_id) \
                      .execute()
                except Exception as sb_e:
                    logger.warning(f"Could not persist plan_cycle for '{user_id}': {sb_e}")

                logger.info(f"Premium activated via Stripe webhook: user='{user_id}' plan='{plan_cycle}'")
            except Exception as e:
                logger.error(f"Failed to activate premium for '{user_id}' via webhook: {e}", exc_info=True)
                raise HTTPException(status_code=500, detail="Erro ao ativar premium.")
        else:
            logger.warning(
                f"checkout.session.completed ignored: payment_ok={payment_ok} user_id={user_id}"
            )

    elif event_type == "customer.subscription.deleted":
        session = event["data"]["object"]
        user_id = (session.get("metadata") or {}).get("user_id")
        if user_id:
            try:
                set_premium(user_id, False)
                logger.info(f"Premium cancelled via Stripe webhook: user='{user_id}'")
            except Exception as e:
                logger.error(f"Failed to cancel premium for '{user_id}' via webhook: {e}", exc_info=True)

    return {"received": True}


# ─── Pluggy Open Banking — Connect Token (JWT required) ───────────────────────

@app.get("/pluggy/token", response_model=PluggyTokenResponse)
def get_pluggy_token(
    token_user_id: str = Depends(get_token_user_id),
):
    """
    Generate a Pluggy Connect Token for the authenticated user.
    The token is consumed by the Pluggy Widget on the frontend to link bank accounts.
    JWT must be valid — the authenticated user's UUID is sent as clientUserId to Pluggy.
    """
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

    if event != "transactions/created":
        logger.info(f"Pluggy webhook ignored: event='{event}' is not 'transactions/created'")
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

    balance = get_balances(user_id, {})
    total_income = get_total_income_for_month(user_id, month)

    row = save_monthly_summary(
        user_id=user_id,
        reference_month=month,
        salary_snapshot=balance.salary,
        bills_snapshot=balance.bills,
        emergency_snapshot=balance.emergency,
        salary_goal=balance.salary_goal,
        bills_goal=balance.bills_goal,
        emergency_goal=balance.emergency_goal,
        total_income=total_income,
    )

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
