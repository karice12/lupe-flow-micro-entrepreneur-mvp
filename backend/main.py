import os
import logging
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from backend.models import (
    PixRequest, PixResponse, UserGoalsRequest, UserStatusResponse,
    WebhookPixRequest, WebhookPixResponse, TransactionsResponse, TransactionItem,
)
from backend.storage import (
    get_balances, save_balances, get_user_status, upsert_goals, save_consent,
    is_transaction_processed, log_transaction, get_recent_transactions, set_premium,
)

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Lupe Flow API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
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


# ─── User ────────────────────────────────────────────────────────────────────

@app.get("/usuario/{user_id}", response_model=UserStatusResponse)
def check_usuario(user_id: str):
    status = get_user_status(user_id)
    return UserStatusResponse(**status)


@app.post("/usuario/{user_id}/metas")
def salvar_metas(user_id: str, req: UserGoalsRequest):
    if req.salary_goal <= 0 or req.bills_goal <= 0 or req.emergency_goal <= 0:
        raise HTTPException(status_code=422, detail="Todas as metas devem ser maiores que zero.")
    upsert_goals(user_id, req.salary_goal, req.bills_goal, req.emergency_goal)
    return {"message": "Metas salvas com sucesso."}


@app.post("/usuario/{user_id}/consent")
def salvar_consent(user_id: str):
    saved_to_db = save_consent(user_id)
    return {"message": "Consentimento LGPD registrado.", "persisted": saved_to_db}


@app.post("/usuario/{user_id}/premium")
def ativar_premium(user_id: str):
    """Simulates a successful checkout and activates the premium plan."""
    set_premium(user_id, True)
    return {"message": "Assinatura Premium ativada com sucesso.", "is_premium": True}


@app.delete("/usuario/{user_id}/premium")
def cancelar_premium(user_id: str):
    set_premium(user_id, False)
    return {"message": "Assinatura cancelada.", "is_premium": False}


# ─── Balances ─────────────────────────────────────────────────────────────────

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


# ─── Transactions feed ────────────────────────────────────────────────────────

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


# ─── Webhook — Open Finance entry point ───────────────────────────────────────

@app.post("/v1/webhook/pix", response_model=WebhookPixResponse)
def webhook_pix(req: WebhookPixRequest, user_id: str = Query(default="usuario_teste")):
    """
    Simulates what Pluggy / Belvo / Open Finance would POST when a PIX is received.
    Applies 30/50/20 split with overflow routing and logs the split in `transactions`.
    Idempotent: if id_transacao_bancaria was already processed, returns 200 without reprocessing.
    """
    if req.valor <= 0:
        raise HTTPException(status_code=422, detail="O valor do Pix deve ser maior que zero.")

    # ── Idempotency check ────────────────────────────────────────────────────
    if is_transaction_processed(req.id_transacao_bancaria):
        logger.info(f"Duplicate webhook ignored: {req.id_transacao_bancaria}")
        return WebhookPixResponse(
            status="ok",
            message="Transação já processada anteriormente (idempotente).",
            idempotent=True,
        )

    # ── Get current balances ─────────────────────────────────────────────────
    balance = get_balances(user_id, {})

    # ── Apply split ──────────────────────────────────────────────────────────
    balance, allocs = _apply_split(req.valor, balance)

    # ── Persist new balances ─────────────────────────────────────────────────
    save_balances(user_id, balance)

    # ── Log each allocation in transactions table ─────────────────────────────
    base_desc = req.descricao.strip() or "Pix Recebido"

    if allocs["alloc_salary"] > 0:
        log_transaction(
            user_id=user_id,
            amount=allocs["alloc_salary"],
            category="salario",
            description=base_desc,
            external_id=req.id_transacao_bancaria,   # idempotency anchor on first row
        )

    if allocs["alloc_bills"] > 0:
        log_transaction(
            user_id=user_id,
            amount=allocs["alloc_bills"],
            category="contas",
            description=base_desc,
        )

    if allocs["alloc_emergency"] > 0:
        log_transaction(
            user_id=user_id,
            amount=allocs["alloc_emergency"],
            category="reserva",
            description=base_desc,
        )

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


# ─── Pix simulator endpoint ───────────────────────────────────────────────────

@app.post("/dividir-pix", response_model=PixResponse)
def dividir_pix(req: PixRequest):
    if req.valor_pix <= 0:
        raise HTTPException(status_code=400, detail="O valor do Pix deve ser maior que zero.")

    defaults = {
        "salary_goal": req.salary_goal or 3000.0,
        "bills_goal":  req.bills_goal  or 1500.0,
        "emergency_goal": req.emergency_goal or 10000.0,
    }

    balance = get_balances(req.user_id, defaults)

    # Snapshot for rollback in case transaction logging fails
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
        # Atomic rollback: restore previous balance if log fails
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
