import os
import logging
from backend.models import BoxBalance

logger = logging.getLogger(__name__)

_in_memory: dict[str, BoxBalance] = {}
_supabase_client = None


def _get_supabase():
    global _supabase_client
    if _supabase_client is not None:
        return _supabase_client
    url = os.getenv("SUPABASE_URL", "").strip()
    key = os.getenv("SUPABASE_ANON_KEY", "").strip()
    if url and key:
        try:
            from supabase import create_client
            _supabase_client = create_client(url, key)
            logger.info("Supabase client initialized successfully.")
            return _supabase_client
        except Exception as e:
            logger.error(f"Failed to initialize Supabase client: {e}")
    else:
        logger.warning("SUPABASE_URL or SUPABASE_ANON_KEY not set — using in-memory storage.")
    return None


def get_balances(user_id: str, defaults: dict) -> BoxBalance:
    sb = _get_supabase()
    if sb:
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
            else:
                logger.info(f"No row found for user '{user_id}', returning zeroed balance.")
                return BoxBalance(
                    salary=0.0,
                    bills=0.0,
                    emergency=0.0,
                    salary_goal=defaults.get("salary_goal", 3000.0),
                    bills_goal=defaults.get("bills_goal", 1500.0),
                    emergency_goal=defaults.get("emergency_goal", 10000.0),
                )
        except Exception as e:
            logger.error(f"Supabase get_balances error for user '{user_id}': {e}")

    # In-memory fallback
    if user_id in _in_memory:
        stored = _in_memory[user_id]
        if defaults.get("salary_goal") is not None:
            stored.salary_goal = defaults["salary_goal"]
        if defaults.get("bills_goal") is not None:
            stored.bills_goal = defaults["bills_goal"]
        if defaults.get("emergency_goal") is not None:
            stored.emergency_goal = defaults["emergency_goal"]
        return stored

    balance = BoxBalance(
        salary=0.0,
        bills=0.0,
        emergency=0.0,
        salary_goal=defaults.get("salary_goal", 3000.0),
        bills_goal=defaults.get("bills_goal", 1500.0),
        emergency_goal=defaults.get("emergency_goal", 10000.0),
    )
    _in_memory[user_id] = balance
    return balance


def save_balances(user_id: str, balance: BoxBalance) -> None:
    sb = _get_supabase()
    if sb:
        try:
            sb.table("user_balances").upsert({
                "user_id": user_id,
                "salary": balance.salary,
                "bills": balance.bills,
                "emergency": balance.emergency,
                "salary_goal": balance.salary_goal,
                "bills_goal": balance.bills_goal,
                "emergency_goal": balance.emergency_goal,
            }).execute()
            logger.info(f"Saved balances to Supabase for user '{user_id}'.")
            return
        except Exception as e:
            logger.error(f"Supabase save_balances error for user '{user_id}': {e}")

    _in_memory[user_id] = balance
    logger.info(f"Saved balances to in-memory for user '{user_id}'.")
