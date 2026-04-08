from pydantic import BaseModel
from typing import Optional


class PixRequest(BaseModel):
    valor_pix: float
    user_id: str
    salary_goal: Optional[float] = None
    bills_goal: Optional[float] = None
    emergency_goal: Optional[float] = None


class BoxBalance(BaseModel):
    salary: float
    bills: float
    emergency: float
    salary_goal: float
    bills_goal: float
    emergency_goal: float


class PixResponse(BaseModel):
    salary: float
    bills: float
    emergency: float
    salary_goal: float
    bills_goal: float
    emergency_goal: float
    allocated_salary: float
    allocated_bills: float
    allocated_emergency: float
    overflow: float


class UserGoalsRequest(BaseModel):
    salary_goal: float
    bills_goal: float
    emergency_goal: float


class UserStatusResponse(BaseModel):
    exists: bool
    has_goals: bool
    lgpd_accepted: bool
    salary_goal: Optional[float] = None
    bills_goal: Optional[float] = None
    emergency_goal: Optional[float] = None
