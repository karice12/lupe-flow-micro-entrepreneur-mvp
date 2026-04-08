import os
import logging
from backend.models import BoxBalance
from fastapi import HTTPException

logger = logging.getLogger(__name__)

_supabase_client = None


def get_supabase():
    global _supabase_client
    if _supabase_client is not None:
        return _supabase_client
    url = os.getenv("SUPABASE_URL", "").strip()
    key = os.getenv("SUPABASE_ANON_KEY", "").strip()
    if not url or not key:
        raise HTTPException(
            status_code=503,
            detail="Banco de dados não configurado. Verifique as variáveis SUPABASE_URL e SUPABASE_ANON_KEY."
        )
    try:
        from supabase import create_client
        _supabase_client = create_client(url, key)
        logger.info("Supabase client initialized successfully.")
        return _supabase_client
    except Exception as e:
        logger.error(f"Failed to initialize Supabase client: {e}")
        raise HTTPException(status_code=503, detail=f"Falha ao conectar ao banco de dados: {e}")


def get_user_status(user_id: str) -> dict:
    sb = get_supabase()
    try:
        res = sb.table("user_balances").select("*").eq("user_id", user_id).execute()
        rows = res.data
        if not rows:
            return {"exists": False, "has_goals": False, "lgpd_accepted": False, "is_premium": False}
        d = rows[0]
        sg = d.get("salary_goal") or 0
        bg = d.get("bills_goal") or 0
        eg = d.get("emergency_goal") or 0
        has_goals = sg > 0 and bg > 0 and eg > 0
        lgpd = bool(d.get("lgpd_accepted", False))
        is_premium = bool(d.get("is_premium", False))
        return {
            "exists": True,
            "has_goals": has_goals,
            "lgpd_accepted": lgpd,
            "is_premium": is_premium,
            "salary_goal": float(sg),
            "bills_goal": float(bg),
            "emergency_goal": float(eg),
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Supabase get_user_status error for '{user_id}': {e}")
        raise HTTPException(status_code=503, detail=f"Erro ao consultar usuário no banco: {e}")


def set_premium(user_id: str, value: bool) -> None:
    """UPSERT is_premium. If the user row doesn't exist yet, creates it with safe defaults."""
    sb = get_supabase()
    try:
        # Check whether the row exists first to avoid overwriting existing balance data
        check = sb.table("user_balances").select("user_id").eq("user_id", user_id).limit(1).execute()
        if check.data:
            # Row exists — only touch is_premium
            sb.table("user_balances").update({"is_premium": value}).eq("user_id", user_id).execute()
            logger.info(f"is_premium={value} updated for existing user '{user_id}'.")
        else:
            # Row doesn't exist — insert with full defaults
            sb.table("user_balances").insert({
                "user_id":       user_id,
                "is_premium":    value,
                "salary":        0,
                "bills":         0,
                "emergency":     0,
                "salary_goal":   0,
                "bills_goal":    0,
                "emergency_goal": 0,
                "lgpd_accepted": False,
            }).execute()
            logger.info(f"is_premium={value} — new row created for user '{user_id}'.")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Supabase set_premium error for '{user_id}': {e}", exc_info=True)
        raise HTTPException(status_code=503, detail=f"Erro ao atualizar assinatura: {e}")


def upsert_goals(user_id: str, salary_goal: float, bills_goal: float, emergency_goal: float) -> None:
    sb = get_supabase()
    try:
        sb.table("user_balances").upsert({
            "user_id": user_id,
            "salary_goal": salary_goal,
            "bills_goal": bills_goal,
            "emergency_goal": emergency_goal,
            "salary": 0.0,
            "bills": 0.0,
            "emergency": 0.0,
        }, on_conflict="user_id", ignore_duplicates=False).execute()
        logger.info(f"Goals saved for user '{user_id}'.")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Supabase upsert_goals error for '{user_id}': {e}")
        raise HTTPException(status_code=503, detail=f"Erro ao salvar metas no banco: {e}")


def save_consent(user_id: str) -> bool:
    sb = get_supabase()
    try:
        sb.table("user_balances").upsert({
            "user_id": user_id,
            "lgpd_accepted": True,
        }, on_conflict="user_id", ignore_duplicates=False).execute()
        logger.info(f"LGPD consent saved for user '{user_id}'.")
        return True
    except Exception as e:
        logger.warning(f"Could not save LGPD consent to DB for '{user_id}': {e}. Client-side fallback will be used.")
        return False


def get_balances(user_id: str, defaults: dict) -> BoxBalance:
    sb = get_supabase()
    try:
        res = sb.table("user_balances").select("*").eq("user_id", user_id).execute()
        rows = res.data
        if rows:
            d = rows[0]
            return BoxBalance(
                salary=float(d.get("salary") or 0.0),
                bills=float(d.get("bills") or 0.0),
                emergency=float(d.get("emergency") or 0.0),
                salary_goal=float(d.get("salary_goal") or defaults.get("salary_goal", 3000.0)),
                bills_goal=float(d.get("bills_goal") or defaults.get("bills_goal", 1500.0)),
                emergency_goal=float(d.get("emergency_goal") or defaults.get("emergency_goal", 10000.0)),
            )
        return BoxBalance(
            salary=0.0, bills=0.0, emergency=0.0,
            salary_goal=defaults.get("salary_goal", 3000.0),
            bills_goal=defaults.get("bills_goal", 1500.0),
            emergency_goal=defaults.get("emergency_goal", 10000.0),
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Supabase get_balances error for '{user_id}': {e}")
        raise HTTPException(status_code=503, detail=f"Erro ao buscar saldos no banco: {e}")


def save_balances(user_id: str, balance: BoxBalance) -> None:
    sb = get_supabase()
    try:
        sb.table("user_balances").upsert({
            "user_id": user_id,
            "salary": balance.salary,
            "bills": balance.bills,
            "emergency": balance.emergency,
            "salary_goal": balance.salary_goal,
            "bills_goal": balance.bills_goal,
            "emergency_goal": balance.emergency_goal,
        }, on_conflict="user_id").execute()
        logger.info(f"Balances saved to Supabase for user '{user_id}'.")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Supabase save_balances error for '{user_id}': {e}")
        raise HTTPException(status_code=503, detail=f"Erro ao salvar saldos no banco: {e}")


def is_transaction_processed(external_id: str) -> bool:
    """Return True if a transaction with this external_id already exists (idempotency guard)."""
    sb = get_supabase()
    try:
        res = sb.table("transactions").select("id").eq("external_id", external_id).limit(1).execute()
        return len(res.data) > 0
    except Exception as e:
        logger.warning(f"Could not check idempotency for external_id '{external_id}': {e}")
        return False


def log_transaction(
    user_id: str,
    amount: float,
    category: str,
    description: str,
    external_id: str | None = None,
) -> None:
    """Insert a single row into the transactions table."""
    sb = get_supabase()
    row: dict = {
        "user_id": user_id,
        "amount": round(amount, 2),
        "category": category,
        "description": description,
    }
    if external_id:
        row["external_id"] = external_id

    try:
        sb.table("transactions").insert(row).execute()
        logger.info(f"Transaction logged: user={user_id} category={category} amount={amount}")
    except Exception as e:
        logger.warning(f"Could not log transaction for '{user_id}': {e}. Continuing without log.")


def get_recent_transactions(user_id: str, limit: int = 10) -> list:
    sb = get_supabase()
    try:
        res = (
            sb.table("transactions")
            .select("*")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        return res.data or []
    except Exception as e:
        logger.warning(f"Could not fetch transactions for '{user_id}': {e}")
        return []
