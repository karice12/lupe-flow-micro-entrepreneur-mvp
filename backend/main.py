import os
import logging
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from backend.models import PixRequest, PixResponse, BoxBalance
from backend.storage import get_balances, save_balances

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


@app.get("/health")
def health():
    return {"status": "ok"}


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


@app.post("/dividir-pix", response_model=PixResponse)
def dividir_pix(req: PixRequest):
    if req.valor_pix <= 0:
        raise HTTPException(status_code=422, detail="valor_pix deve ser maior que zero.")

    defaults = {
        "salary_goal": req.salary_goal or 3000.0,
        "bills_goal": req.bills_goal or 1500.0,
        "emergency_goal": req.emergency_goal or 10000.0,
    }

    balance = get_balances(req.user_id, defaults)
    valor = req.valor_pix

    base_salary = valor * 0.30
    base_bills = valor * 0.50
    base_emergency = valor * 0.20

    overflow = 0.0

    new_salary = balance.salary + base_salary
    if new_salary > balance.salary_goal:
        overflow += new_salary - balance.salary_goal
        new_salary = balance.salary_goal

    new_bills = balance.bills + base_bills
    if new_bills > balance.bills_goal:
        overflow += new_bills - balance.bills_goal
        new_bills = balance.bills_goal

    allocated_salary = new_salary - balance.salary
    allocated_bills = new_bills - balance.bills
    allocated_emergency = base_emergency + overflow

    new_emergency = balance.emergency + allocated_emergency

    balance.salary = new_salary
    balance.bills = new_bills
    balance.emergency = new_emergency

    save_balances(req.user_id, balance)

    return PixResponse(
        salary=round(new_salary, 2),
        bills=round(new_bills, 2),
        emergency=round(new_emergency, 2),
        salary_goal=balance.salary_goal,
        bills_goal=balance.bills_goal,
        emergency_goal=balance.emergency_goal,
        allocated_salary=round(allocated_salary, 2),
        allocated_bills=round(allocated_bills, 2),
        allocated_emergency=round(allocated_emergency, 2),
        overflow=round(overflow, 2),
    )
