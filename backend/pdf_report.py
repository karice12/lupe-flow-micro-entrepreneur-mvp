"""
Geração de Relatório PDF Mensal — Lupe Flow
Utiliza ReportLab para gerar um PDF com identidade visual do produto.
Paleta: fundo escuro (#0F1117), laranja primário (#F97316), branco/cinza claro.
"""

import io
import os
from datetime import datetime, timezone
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.pdfgen import canvas as pdf_canvas
from reportlab.lib.utils import ImageReader


# ── Paleta ──────────────────────────────────────────────────────────────────
BG_DARK      = colors.HexColor("#0F1117")
ORANGE       = colors.HexColor("#F97316")
ORANGE_LIGHT = colors.HexColor("#FED7AA")
WHITE        = colors.HexColor("#F8FAFC")
GRAY_TEXT    = colors.HexColor("#94A3B8")
GRAY_CARD    = colors.HexColor("#1E2330")
GRAY_BORDER  = colors.HexColor("#2D3748")
GREEN        = colors.HexColor("#34D399")

W, H = A4  # 595 x 842 pts

# Fix 1 — mapa de meses em PT-BR (strftime("%B") retorna inglês no servidor)
_MONTHS_PT = {
    1: "Janeiro", 2: "Fevereiro", 3: "Março",    4: "Abril",
    5: "Maio",    6: "Junho",     7: "Julho",     8: "Agosto",
    9: "Setembro",10: "Outubro",  11: "Novembro", 12: "Dezembro",
}


def _month_label_pt(reference_month: str) -> str:
    """Converte 'YYYY-MM' em 'Março de 2025' (PT-BR)."""
    try:
        dt = datetime.strptime(reference_month, "%Y-%m")
        return f"{_MONTHS_PT[dt.month]} de {dt.year}"
    except Exception:
        return reference_month


def _brl(value: float) -> str:
    return f"R$ {value:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def _get_supabase():
    from supabase import create_client
    url = os.getenv("SUPABASE_URL", "").strip()
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip() or os.getenv("SUPABASE_ANON_KEY", "").strip()
    return create_client(url, key)


def _month_range(reference_month: str) -> tuple[str, str]:
    """Returns (start_iso, end_iso) in UTC with explicit +00:00 offset."""
    year, month = int(reference_month[:4]), int(reference_month[5:7])
    start = f"{year:04d}-{month:02d}-01T00:00:00+00:00"
    if month == 12:
        end = f"{year + 1:04d}-01-01T00:00:00+00:00"
    else:
        end = f"{year:04d}-{month + 1:02d}-01T00:00:00+00:00"
    return start, end


def _fetch_total_income(user_id: str, reference_month: str) -> float:
    """Fallback: SUM(amount) de todas as transações do mês (todas as rows são entradas)."""
    try:
        sb = _get_supabase()
        start_iso, end_iso = _month_range(reference_month)
        print(f"[PDF][_fetch_total_income] user={user_id} start={start_iso} end={end_iso}", flush=True)
        res = (
            sb.table("transactions")
            .select("amount")
            .eq("user_id", user_id)
            .gte("created_at", start_iso)
            .lt("created_at", end_iso)
            .execute()
        )
        print(f"[PDF][_fetch_total_income] rows={len(res.data or [])} data={res.data}", flush=True)
        return sum(float(row.get("amount", 0)) for row in (res.data or []))
    except Exception as e:
        print(f"[PDF][_fetch_total_income] ERROR: {e}", flush=True)
        return 0.0


def _fetch_top_transactions(user_id: str, reference_month: str) -> list[dict]:
    """Fallback: Top 5 transações por amount DESC com filtro de data UTC explícito."""
    try:
        sb = _get_supabase()
        start_iso, end_iso = _month_range(reference_month)
        print(f"[PDF][_fetch_top_transactions] user={user_id} start={start_iso} end={end_iso}", flush=True)
        res = (
            sb.table("transactions")
            .select("id,user_id,amount,category,description,created_at")
            .eq("user_id", user_id)
            .gte("created_at", start_iso)
            .lt("created_at", end_iso)
            .order("amount", desc=True)
            .limit(5)
            .execute()
        )
        print(f"[PDF][_fetch_top_transactions] rows={len(res.data or [])} data={res.data}", flush=True)
        return res.data or []
    except Exception as e:
        print(f"[PDF][_fetch_top_transactions] ERROR: {e}", flush=True)
        return []


def _rect(c: pdf_canvas.Canvas, x, y, w, h, fill_color, radius=4):
    c.setFillColor(fill_color)
    c.roundRect(x, y, w, h, radius, fill=1, stroke=0)


def _text(c: pdf_canvas.Canvas, text: str, x, y, size=10, color=WHITE,
          bold=False, align="left"):
    font = "Helvetica-Bold" if bold else "Helvetica"
    c.setFont(font, size)
    c.setFillColor(color)
    if align == "right":
        c.drawRightString(x, y, text)
    elif align == "center":
        c.drawCentredString(x, y, text)
    else:
        c.drawString(x, y, text)


def generate_monthly_pdf(
    user_id: str,
    reference_month: str,          # 'YYYY-MM'
    salary_snapshot: float,
    bills_snapshot: float,
    emergency_snapshot: float,
    salary_goal: float,
    bills_goal: float,
    emergency_goal: float,
    total_income: float,
    top_transactions: list[dict],  # [{"description": str, "amount": float, "category": str, "created_at": str}]
) -> bytes:
    """
    Gera o PDF de relatório mensal e retorna os bytes.
    """
    print(f"[PDF] user_id={user_id} reference_month={reference_month}", flush=True)
    print(f"[PDF] total_income={total_income}", flush=True)
    print(f"[PDF] top_transactions count={len(top_transactions)} data={top_transactions}", flush=True)
    print(f"[PDF] salary={salary_snapshot}/{salary_goal} bills={bills_snapshot}/{bills_goal} emergency={emergency_snapshot}/{emergency_goal}", flush=True)

    # Se total_income vier zero do caller, tenta buscar direto do banco
    if total_income == 0:
        total_income = _fetch_total_income(user_id, reference_month)
        print(f"[PDF] total_income fallback from DB={total_income}", flush=True)

    # Se top_transactions vier vazio do caller, tenta buscar direto do banco
    if not top_transactions:
        top_transactions = _fetch_top_transactions(user_id, reference_month)
        print(f"[PDF] top_transactions fallback from DB count={len(top_transactions)} data={top_transactions}", flush=True)

    buf = io.BytesIO()
    c = pdf_canvas.Canvas(buf, pagesize=A4)
    c.setTitle(f"Lupe Flow — Relatório {reference_month}")

    # ── Fundo ──────────────────────────────────────────────────────────────
    _rect(c, 0, 0, W, H, BG_DARK, radius=0)

    # ── Faixa de cabeçalho ─────────────────────────────────────────────────
    header_h = 72
    _rect(c, 0, H - header_h, W, header_h, GRAY_CARD, radius=0)

    # Linha laranja inferior do header
    c.setFillColor(ORANGE)
    c.rect(0, H - header_h, W, 2, fill=1, stroke=0)

    # ── Logo desenhado vetorialmente ───────────────────────────────────────
    logo_x, logo_y = 24*mm, H - 50
    logo_size = 28

    # Fundo laranja arredondado
    c.setFillColor(ORANGE)
    c.roundRect(logo_x, logo_y, logo_size, logo_size, 6, fill=1, stroke=0)

    # Raio do ícone (lightning bolt) em branco, centralizado no quadrado
    c.setFillColor(WHITE)
    cx_l = logo_x + logo_size / 2
    cy_l = logo_y + logo_size / 2
    # Polígono em forma de raio (bolt)
    bolt = [
        (cx_l + 3,   cy_l + 11),   # topo direito
        (cx_l - 1,   cy_l + 2),    # meio esquerdo cima
        (cx_l + 2,   cy_l + 2),    # ponto central superior
        (cx_l - 3,   cy_l - 11),   # fundo esquerdo
        (cx_l + 1,   cy_l - 2),    # meio direito baixo
        (cx_l - 2,   cy_l - 2),    # ponto central inferior
    ]
    path = c.beginPath()
    path.moveTo(*bolt[0])
    for pt in bolt[1:]:
        path.lineTo(*pt)
    path.close()
    c.drawPath(path, fill=1, stroke=0)

    # Título ao lado do logo
    _text(c, "Lupe Flow", 24*mm + logo_size + 6, H - 35, size=18, bold=True, color=ORANGE)
    _text(c, "Relatório de Fechamento Mensal", 24*mm + logo_size + 6, H - 51, size=9, color=GRAY_TEXT)

    # Mês de referência (canto direito) — Fix 1: PT-BR via _month_label_pt
    month_label = _month_label_pt(reference_month)
    _text(c, month_label, W - 24*mm, H - 38, size=13, bold=True, color=WHITE, align="right")
    _text(c, f"Gerado em {datetime.now().strftime('%d/%m/%Y')}", W - 24*mm, H - 54,
          size=8, color=GRAY_TEXT, align="right")

    y = H - header_h - 18*mm

    # ── Seção: Resumo Total ────────────────────────────────────────────────
    _text(c, "TOTAL DE ENTRADAS NO MÊS", 24*mm, y, size=8, color=GRAY_TEXT, bold=True)
    y -= 8*mm
    _rect(c, 24*mm, y - 6*mm, W - 48*mm, 14*mm, ORANGE, radius=6)
    _text(c, _brl(total_income), W / 2, y + 1.5*mm, size=18, bold=True,
          color=WHITE, align="center")
    y -= 20*mm

    # ── Seção: As 3 Caixas ────────────────────────────────────────────────
    _text(c, "DISTRIBUIÇÃO DAS CAIXAS", 24*mm, y, size=8, color=GRAY_TEXT, bold=True)
    y -= 8*mm

    boxes = [
        ("💼  Caixa Salário",     salary_snapshot,    salary_goal,    "30% do total"),
        ("📋  Caixa Contas",      bills_snapshot,     bills_goal,     "50% do total"),
        ("🛡  Reserva de Emergência", emergency_snapshot, emergency_goal, "20% + overflow"),
    ]

    card_w = (W - 48*mm - 8*mm) / 3
    for i, (label, value, goal, pct_label) in enumerate(boxes):
        cx = 24*mm + i * (card_w + 4*mm)
        card_h = 38*mm
        _rect(c, cx, y - card_h, card_w, card_h, GRAY_CARD, radius=6)

        # Borda laranja superior
        c.setFillColor(ORANGE)
        c.roundRect(cx, y - 3, card_w, 3, 2, fill=1, stroke=0)

        _text(c, label, cx + 4*mm, y - 10, size=7.5, color=GRAY_TEXT, bold=True)
        _text(c, _brl(value), cx + 4*mm, y - 20, size=12, bold=True, color=WHITE)

        # Barra de progresso
        bar_y = y - card_h + 18
        bar_w = card_w - 8*mm
        pct = min(value / goal, 1.0) if goal > 0 else 0
        _rect(c, cx + 4*mm, bar_y, bar_w, 4, GRAY_BORDER, radius=2)
        if pct > 0:
            fill_color = GREEN if pct >= 1.0 else ORANGE
            _rect(c, cx + 4*mm, bar_y, bar_w * pct, 4, fill_color, radius=2)

        _text(c, f"Meta: {_brl(goal)}", cx + 4*mm, bar_y - 8, size=7, color=GRAY_TEXT)
        _text(c, pct_label, cx + card_w - 4*mm, bar_y - 8, size=7,
              color=ORANGE_LIGHT, align="right")

    y -= 44*mm

    # ── Seção: Top Transações ─────────────────────────────────────────────
    _text(c, "5 MAIORES TRANSAÇÕES DO MÊS", 24*mm, y, size=8, color=GRAY_TEXT, bold=True)
    y -= 8*mm

    CATEGORY_PT = {
        "salario": "Salário",
        "contas":  "Contas",
        "reserva": "Reserva",
    }

    if not top_transactions:
        _rect(c, 24*mm, y - 14*mm, W - 48*mm, 14*mm, GRAY_CARD, radius=6)
        _text(c, "Nenhuma transação registrada neste mês.", W / 2, y - 7*mm,
              size=9, color=GRAY_TEXT, align="center")
        y -= 20*mm
    else:
        row_h = 11*mm
        for idx, tx in enumerate(top_transactions[:5]):
            row_color = GRAY_CARD if idx % 2 == 0 else colors.HexColor("#161B27")
            _rect(c, 24*mm, y - row_h, W - 48*mm, row_h, row_color, radius=4)

            # Número
            _text(c, f"{idx + 1}.", 26*mm, y - 7, size=8, color=GRAY_TEXT)

            # Descrição
            desc = (tx.get("description") or "Sem descrição")[:38]
            _text(c, desc, 32*mm, y - 7, size=9, color=WHITE)

            # Categoria
            cat_raw = tx.get("category", "outros")
            cat_label = CATEGORY_PT.get(cat_raw, cat_raw.capitalize())
            _text(c, cat_label, W / 2 + 10*mm, y - 7, size=8, color=ORANGE_LIGHT)

            # Data
            try:
                dt_str = datetime.fromisoformat(
                    str(tx.get("created_at", "")).replace("Z", "+00:00")
                ).strftime("%d/%m/%Y")
            except Exception:
                dt_str = ""
            _text(c, dt_str, W - 60*mm, y - 7, size=8, color=GRAY_TEXT)

            # Valor
            _text(c, f"+{_brl(tx.get('amount', 0))}", W - 24*mm, y - 7,
                  size=9, bold=True, color=GREEN, align="right")

            y -= row_h + 1.5*mm

    y -= 8*mm

    # ── Nota sobre Reserva ────────────────────────────────────────────────
    _rect(c, 24*mm, y - 14*mm, W - 48*mm, 14*mm, colors.HexColor("#1A2535"), radius=6)
    c.setFillColor(colors.HexColor("#1D4ED8"))
    c.roundRect(24*mm, y - 14*mm, 2, 14*mm, 1, fill=1, stroke=0)
    _text(c, "ℹ  O saldo da Reserva de Emergência é preservado no fechamento mensal.",
          28*mm, y - 7*mm, size=8, color=GRAY_TEXT)

    y -= 20*mm

    # ── Rodapé ────────────────────────────────────────────────────────────
    c.setFillColor(GRAY_BORDER)
    c.rect(24*mm, 18*mm, W - 48*mm, 0.5, fill=1, stroke=0)
    _text(c, "Lupe Flow · Gestão Financeira para MEI · lupeflow.com.br",
          W / 2, 12*mm, size=7, color=GRAY_TEXT, align="center")
    _text(c, f"ID do usuário: {user_id[:18]}...",
          W / 2, 7*mm, size=6, color=GRAY_BORDER, align="center")

    c.save()
    return buf.getvalue()
