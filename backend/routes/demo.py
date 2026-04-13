import io
from datetime import datetime
from fastapi import APIRouter
from fastapi.responses import StreamingResponse

router = APIRouter(prefix="/demo", tags=["demo"])

_DEMO_DATA = {
    "salary": 3000.0,
    "bills": 4000.0,
    "emergency": 3000.0,
    "salary_goal": 6000.0,
    "bills_goal": 5000.0,
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


@router.get("/relatorio")
async def get_demo_relatorio():
    from backend.pdf_report import generate_monthly_pdf

    reference_month = datetime.utcnow().strftime("%Y-%m")
    total_income = sum(float(t["amount"]) for t in _DEMO_DATA["transactions"])

    try:
        pdf_bytes = generate_monthly_pdf(
            user_id="demo-user",
            reference_month=reference_month,
            salary_snapshot=_DEMO_DATA["salary"],
            bills_snapshot=_DEMO_DATA["bills"],
            emergency_snapshot=_DEMO_DATA["emergency"],
            salary_goal=_DEMO_DATA["salary_goal"],
            bills_goal=_DEMO_DATA["bills_goal"],
            emergency_goal=_DEMO_DATA["emergency_goal"],
            total_income=total_income,
            top_transactions=_DEMO_DATA["transactions"],
            force_values=True,
        )
    except Exception as e:
        raise Exception(f"Erro ao gerar PDF demo: {e}")

    return StreamingResponse(
        iter([pdf_bytes]),
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="lupeflow-demo.pdf"'},
    )
