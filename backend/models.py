from pydantic import BaseModel
from typing import Optional, List


class PixRequest(BaseModel):
    valor_pix: float
    user_id: str
    salary_goal: Optional[float] = None
    bills_goal: Optional[float] = None
    emergency_goal: Optional[float] = None
    description: Optional[str] = None


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
    is_premium: bool = False
    plan_cycle: Optional[str] = None
    salary_goal: Optional[float] = None
    bills_goal: Optional[float] = None
    emergency_goal: Optional[float] = None


class WebhookPixRequest(BaseModel):
    valor: float
    descricao: str
    id_transacao_bancaria: str


class WebhookPixResponse(BaseModel):
    status: str
    message: str
    idempotent: bool
    salary: Optional[float] = None
    bills: Optional[float] = None
    emergency: Optional[float] = None
    overflow: Optional[float] = None


class TransactionItem(BaseModel):
    id: str
    user_id: str
    amount: float
    category: str
    description: Optional[str] = None
    external_id: Optional[str] = None
    created_at: str


class TransactionsResponse(BaseModel):
    transactions: List[TransactionItem]


class BankConnection(BaseModel):
    id: str
    user_id: str
    bank_name: str
    status: str
    provider_id: Optional[str] = None
    activated_at: str
    deactivated_at: Optional[str] = None


class BankConnectionListResponse(BaseModel):
    connections: List[BankConnection]
    billable_units: int


class AddBankConnectionRequest(BaseModel):
    bank_name: str
    provider_id: Optional[str] = None


class CheckoutSessionRequest(BaseModel):
    plan_cycle: str
    user_id: str


class CheckoutSessionResponse(BaseModel):
    checkout_url: str


class PluggyTokenResponse(BaseModel):
    connect_token: str


# ─── Pluggy Webhook ───────────────────────────────────────────────────────────

class PluggyWebhookTransaction(BaseModel):
    id: Optional[str] = None
    amount: Optional[float] = None
    description: Optional[str] = None
    category: Optional[str] = None

    model_config = {"extra": "allow"}


class PluggyWebhookItem(BaseModel):
    id: Optional[str] = None
    clientUserId: Optional[str] = None

    model_config = {"extra": "allow"}


class PluggyWebhookData(BaseModel):
    item: Optional[PluggyWebhookItem] = None
    transactions: Optional[List[PluggyWebhookTransaction]] = None

    model_config = {"extra": "allow"}


class PluggyWebhookPayload(BaseModel):
    event: Optional[str] = None
    itemId: Optional[str] = None
    data: Optional[PluggyWebhookData] = None

    model_config = {"extra": "allow"}


# ─── Monthly Summary ──────────────────────────────────────────────────────────

class MonthlySummary(BaseModel):
    id: str
    user_id: str
    reference_month: str
    salary_snapshot: float
    bills_snapshot: float
    emergency_snapshot: float
    salary_goal: float
    bills_goal: float
    emergency_goal: float
    total_income: float
    created_at: str


class MonthlyCloseResponse(BaseModel):
    message: str
    reference_month: str
    salary_snapshot: float
    bills_snapshot: float
    emergency_snapshot: float
    total_income: float


class MonthlyHistoryItem(BaseModel):
    reference_month: str
    salary_snapshot: float
    bills_snapshot: float
    emergency_snapshot: float
    salary_goal: float
    bills_goal: float
    emergency_goal: float
    total_income: float
    created_at: str
    income_variation_pct: Optional[float] = None


class MonthlyHistoryResponse(BaseModel):
    history: List[MonthlyHistoryItem]
    count: int
