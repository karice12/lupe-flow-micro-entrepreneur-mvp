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
    # Prefer the service role key so the backend bypasses RLS entirely.
    # Fall back to anon key if no service role key is set.
    service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    anon_key    = os.getenv("SUPABASE_ANON_KEY", "").strip()
    key = service_key or anon_key
    if not url or not key:
        raise HTTPException(
            status_code=503,
            detail="Banco de dados não configurado. Verifique as variáveis SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (ou SUPABASE_ANON_KEY)."
        )
    key_type = "service_role" if service_key else "anon"
    print(f"[Supabase] Tentando conectar ao Supabase em: {url} (key_type={key_type})", flush=True)
    try:
        from supabase import create_client
        _supabase_client = create_client(url, key)
        logger.info(f"Supabase client initialized successfully (key_type={key_type}).")
        print(f"[Supabase] Cliente inicializado com sucesso (key_type={key_type})", flush=True)
        return _supabase_client
    except Exception as e:
        logger.error(f"Failed to initialize Supabase client: {e}")
        print(f"[Supabase] ERRO ao inicializar cliente: {e}", flush=True)
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
    """
    Safely set is_premium for a user.
    - If the row already exists: UPDATE only is_premium — balances are NEVER touched.
    - If the row is new: INSERT with zeroed balances (safe because user has no data yet).
    """
    sb = get_supabase()
    try:
        check = sb.table("user_balances").select("user_id").eq("user_id", user_id).limit(1).execute()

        if check.data:
            # Row exists — only flip is_premium, leave all balance/goal columns intact
            sb.table("user_balances") \
              .update({"is_premium": value}) \
              .eq("user_id", user_id) \
              .execute()
            logger.info(f"set_premium UPDATE OK — user='{user_id}' is_premium={value}")
        else:
            # Brand-new user — safe to INSERT with zeroed defaults
            sb.table("user_balances").insert({
                "user_id":        user_id,
                "is_premium":     value,
                "salary":         0,
                "bills":          0,
                "emergency":      0,
                "salary_goal":    0,
                "bills_goal":     0,
                "emergency_goal": 0,
                "lgpd_accepted":  False,
            }).execute()
            logger.info(f"set_premium INSERT OK — user='{user_id}' is_premium={value} (new row)")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            f"set_premium FAILED for user='{user_id}' is_premium={value} "
            f"error_type={type(e).__name__} detail={e}",
            exc_info=True,
        )
        raise HTTPException(
            status_code=503,
            detail=f"Erro ao atualizar assinatura: [{type(e).__name__}] {e}",
        )


def upsert_goals(user_id: str, salary_goal: float, bills_goal: float, emergency_goal: float) -> None:
    sb = get_supabase()
    try:
        check = sb.table("user_balances").select("user_id").eq("user_id", user_id).limit(1).execute()
        if check.data:
            sb.table("user_balances").update({
                "salary_goal": salary_goal,
                "bills_goal": bills_goal,
                "emergency_goal": emergency_goal,
            }).eq("user_id", user_id).execute()
        else:
            sb.table("user_balances").insert({
                "user_id": user_id,
                "salary_goal": salary_goal,
                "bills_goal": bills_goal,
                "emergency_goal": emergency_goal,
                "salary": 0.0,
                "bills": 0.0,
                "emergency": 0.0,
            }).execute()
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


# ─── Bank Connections ─────────────────────────────────────────────────────────

def list_bank_connections(user_id: str) -> list:
    """
    Return all bank_connections rows for the user (active + inactive),
    ordered newest first.
    """
    sb = get_supabase()
    try:
        res = (
            sb.table("bank_connections")
            .select("*")
            .eq("user_id", user_id)
            .order("activated_at", desc=True)
            .execute()
        )
        return res.data or []
    except Exception as e:
        logger.error(f"list_bank_connections error for '{user_id}': {e}")
        raise HTTPException(status_code=503, detail=f"Erro ao listar conexões bancárias: {e}")


def add_bank_connection(user_id: str, bank_name: str, provider_id: str | None = None) -> dict:
    """
    Insert a new active bank connection for the user.
    Returns the created row.
    """
    sb = get_supabase()
    row: dict = {
        "user_id":   user_id,
        "bank_name": bank_name,
        "status":    "active",
    }
    if provider_id:
        row["provider_id"] = provider_id
    try:
        res = sb.table("bank_connections").insert(row).execute()
        if not res.data:
            raise ValueError("Insert returned no data.")
        logger.info(f"Bank connection added: user='{user_id}' bank='{bank_name}'")
        return res.data[0]
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"add_bank_connection error for '{user_id}': {e}")
        raise HTTPException(status_code=503, detail=f"Erro ao adicionar conexão bancária: {e}")


def deactivate_bank_connection(user_id: str, connection_id: str) -> dict:
    """
    Soft-delete: set status='inactive' and record deactivated_at.
    The row is preserved for billing calculations of the current cycle.
    Returns the updated row.
    """
    from datetime import datetime, timezone
    sb = get_supabase()
    try:
        # Verify ownership before updating
        check = (
            sb.table("bank_connections")
            .select("id, user_id, status")
            .eq("id", connection_id)
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        if not check.data:
            raise HTTPException(status_code=404, detail="Conexão bancária não encontrada ou não pertence ao usuário.")
        if check.data[0]["status"] == "inactive":
            raise HTTPException(status_code=409, detail="A conexão já está inativa.")

        now_iso = datetime.now(timezone.utc).isoformat()
        res = (
            sb.table("bank_connections")
            .update({"status": "inactive", "deactivated_at": now_iso})
            .eq("id", connection_id)
            .eq("user_id", user_id)
            .execute()
        )
        if not res.data:
            raise ValueError("Update returned no data.")
        logger.info(f"Bank connection deactivated: user='{user_id}' id='{connection_id}'")
        return res.data[0]
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"deactivate_bank_connection error for '{user_id}': {e}")
        raise HTTPException(status_code=503, detail=f"Erro ao inativar conexão bancária: {e}")


def count_billable_units(user_id: str) -> int:
    """
    Count how many distinct banks were active at ANY point in the current
    calendar month, then subtract 1 (the bank included in the base plan).
    Returns the number of *extra* billable bank connections (minimum 0).

    Logic:
      A connection is billable for the month if:
        activated_at  <= last moment of current month
        AND (deactivated_at IS NULL OR deactivated_at >= first moment of month)
    """
    from datetime import datetime, timezone
    sb = get_supabase()
    try:
        now = datetime.now(timezone.utc)
        # First and last instant of the current calendar month (UTC)
        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        if now.month == 12:
            month_end = now.replace(year=now.year + 1, month=1, day=1,
                                    hour=0, minute=0, second=0, microsecond=0)
        else:
            month_end = now.replace(month=now.month + 1, day=1,
                                    hour=0, minute=0, second=0, microsecond=0)

        month_start_iso = month_start.isoformat()
        month_end_iso   = month_end.isoformat()

        # Connections activated before month end
        res = (
            sb.table("bank_connections")
            .select("id, deactivated_at")
            .eq("user_id", user_id)
            .lte("activated_at", month_end_iso)
            .execute()
        )
        rows = res.data or []

        # Filter: deactivated_at is NULL (still active) OR deactivated_at >= month_start
        billable = [
            r for r in rows
            if r.get("deactivated_at") is None
            or r["deactivated_at"] >= month_start_iso
        ]
        total = len(billable)
        extra = max(0, total - 1)
        logger.info(
            f"count_billable_units: user='{user_id}' total={total} extra={extra} "
            f"period=[{month_start_iso} → {month_end_iso}]"
        )
        return extra
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"count_billable_units error for '{user_id}': {e}")
        raise HTTPException(status_code=503, detail=f"Erro ao calcular unidades faturáveis: {e}")
