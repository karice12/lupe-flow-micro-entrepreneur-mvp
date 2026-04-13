import io
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
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.lib import colors
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import cm

        buffer = io.BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=2 * cm, bottomMargin=2 * cm)
        styles = getSampleStyleSheet()
        story = []

        title_style = ParagraphStyle(
            "title", parent=styles["Title"], fontSize=20, textColor=colors.HexColor("#f97316"),
        )
        story.append(Paragraph("Lupe Flow — Relatório Demo", title_style))
        story.append(Spacer(1, 0.4 * cm))
        story.append(Paragraph("Modo Demonstração — dados fictícios", styles["Normal"]))
        story.append(Spacer(1, 0.8 * cm))

        story.append(Paragraph("Distribuição das 3 Caixas", styles["Heading2"]))
        story.append(Spacer(1, 0.3 * cm))

        table_data = [
            ["Caixa", "Acumulado", "Meta"],
            ["Salário",    "R$ 3.000,00",  "R$ 6.000,00"],
            ["Contas",     "R$ 4.000,00",  "R$ 5.000,00"],
            ["Emergência", "R$ 3.000,00",  "R$ 10.000,00"],
            ["Total",      "R$ 10.000,00", "R$ 21.000,00"],
        ]
        table = Table(table_data, colWidths=[6 * cm, 5 * cm, 5 * cm])
        table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f97316")),
            ("TEXTCOLOR",  (0, 0), (-1, 0), colors.white),
            ("FONTNAME",   (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTNAME",   (0, -1), (-1, -1), "Helvetica-Bold"),
            ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#fef3c7")),
            ("ALIGN",      (1, 0), (-1, -1), "RIGHT"),
            ("ROWBACKGROUNDS", (0, 1), (-1, -2), [colors.white, colors.HexColor("#f9fafb")]),
            ("GRID",       (0, 0), (-1, -1), 0.5, colors.HexColor("#e5e7eb")),
            ("LEFTPADDING",  (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ("TOPPADDING",   (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING",(0, 0), (-1, -1), 6),
        ]))
        story.append(table)
        story.append(Spacer(1, 0.8 * cm))
        story.append(Paragraph(
            "Este é um relatório de demonstração gerado pelo Lupe Flow. "
            "Assine o plano Premium para gerar relatórios reais com seus dados.",
            styles["Normal"],
        ))

        doc.build(story)
        buffer.seek(0)
        return StreamingResponse(
            buffer,
            media_type="application/pdf",
            headers={"Content-Disposition": 'attachment; filename="lupeflow-demo.pdf"'},
        )
    except Exception as e:
        raise Exception(f"Erro ao gerar PDF demo: {e}")
