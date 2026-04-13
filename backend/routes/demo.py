from fastapi import APIRouter

router = APIRouter(prefix="/demo", tags=["demo"])

_DEMO_DATA = {
    "salary": 5000.0,
    "bills": 3000.0,
    "emergency": 2000.0,
    "salary_goal": 6000.0,
    "bills_goal": 4000.0,
    "emergency_goal": 10000.0,
    "is_premium": True,
    "lgpd_accepted": True,
    "transactions": [
        {
            "id": "demo-1",
            "amount": 1500.0,
            "category": "salario",
            "description": "Pix de cliente #1",
            "created_at": "2026-04-13T09:00:00Z",
        },
        {
            "id": "demo-2",
            "amount": 1000.0,
            "category": "contas",
            "description": "Pagamento fornecedor",
            "created_at": "2026-04-12T15:30:00Z",
        },
        {
            "id": "demo-3",
            "amount": 400.0,
            "category": "reserva",
            "description": "Reserva de emergência",
            "created_at": "2026-04-11T11:00:00Z",
        },
        {
            "id": "demo-4",
            "amount": 2000.0,
            "category": "salario",
            "description": "Pix de cliente #2",
            "created_at": "2026-04-10T08:45:00Z",
        },
        {
            "id": "demo-5",
            "amount": 600.0,
            "category": "contas",
            "description": "Despesa operacional",
            "created_at": "2026-04-09T14:20:00Z",
        },
    ],
}


@router.get("/data")
async def get_demo_data() -> dict:
    return _DEMO_DATA
