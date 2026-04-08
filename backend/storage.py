import os
from typing import Optional
from backend.models import BoxBalance

_in_memory: dict[str, BoxBalance] = {}

def _get_supabase():
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_ANON_KEY")
    if url and key:
        try:
            from supabase import create_client
            return create_client(url, key)
        except Exception:
            pass
    return None


def get_balances(user_id: str, defaults: dict) -> BoxBalance:
    sb = _get_supabase()
    if sb:
        try:
            res = sb.table("user_balances").select("*").eq("user_id", user_id).single().execute()
            if res.data:
                d = res.data
                return BoxBalance(
                    salary=d.get("salary", 0.0),
                    bills=d.get("bills", 0.0),
                    emergency=d.get("emergency", 0.0),
                    salary_goal=d.get("salary_goal", defaults["salary_goal"]),
                    bills_goal=d.get("bills_goal", defaults["bills_goal"]),
                    emergency_goal=d.get("emergency_goal", defaults["emergency_goal"]),
                )
        except Exception:
            pass

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
            return
        except Exception:
            pass
    _in_memory[user_id] = balance
