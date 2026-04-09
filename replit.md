# Lupe Flow — Production Ready

Micro-SaaS financeiro para microempreendedores (MEI). Implementa a **Regra das 3 Caixas** (30% Salário / 50% Contas / 20% Emergência) com lógica de transbordo. Frontend React + Backend Python/FastAPI + Supabase (PostgreSQL).

## Architecture

- **Frontend**: React 18 + TypeScript + Vite (port 5000)
- **Backend**: Python 3.11 + FastAPI + Uvicorn (port 8000)
- **Database**: Supabase (PostgreSQL) — sem fallback em memória, erros explícitos
- **Styling**: Tailwind CSS + shadcn/ui (Dark Mode Premium, laranja/âmbar primário)
- **Routing**: React Router DOM v6 — rotas: `/`, `/onboarding`, `/dashboard`, `/transactions`
- **State**: GoalsContext (userId + goals + isPremium) + `useUserStats` custom hook centralizado

## Running

Two workflows start automatically:
- **Start application** — `npm run dev` on port 5000 (webview, proxies `/api/*` to backend)
- **Backend API** — `python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload`

## Project Structure

```
src/
  App.tsx                           # Routes: /, /onboarding, /dashboard, /transactions
  contexts/GoalsContext.tsx         # userId + goals + isPremium + signOut
  hooks/useUserStats.tsx            # Centralizes all Supabase fetches + Realtime subscription
  pages/
    Auth.tsx                        # Login/Signup com Supabase Auth (email + Google OAuth)
    Onboarding.tsx                  # Salva metas via POST /api/usuario/{id}/metas
    Index.tsx                       # Dashboard — usa useUserStats, BoxCard (donut), PremiumModal
    Transactions.tsx                # Histórico completo (Premium only, /transactions)
    NotFound.tsx
  components/
    BoxCard.tsx                     # Card com anel SVG (donut chart) + "Faltam R$ X"
    PixSimulator.tsx                # Simulador de Pix (Premium gated)
    PremiumModal.tsx                # Modal de upgrade R$29,90/mês
    BankConnectionsCard.tsx         # Gerenciar conexões bancárias (free = upsell; premium = lista)
    LgpdModal.tsx                   # Modal LGPD com aceite de termos
    LgpdFooter.tsx

backend/
  main.py       # FastAPI routes — /dividir-pix retorna 400 (não 422) + rollback atômico
  models.py     # PixRequest, PixResponse, BankConnection, BankConnectionListResponse...
  storage.py    # Supabase CRUD — raise HTTP 503 on failure, no in-memory fallback
  auth.py       # JWT middleware — get_token_user_id + assert_owns_resource
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET  | `/health` | Backend health check |
| GET  | `/config/supabase` | Retorna URL + anon key para o frontend |
| GET  | `/usuario/{user_id}` | Status do usuário (exists, has_goals, is_premium) |
| POST | `/usuario/{user_id}/metas` | Salva/atualiza metas no Supabase |
| POST | `/usuario/{user_id}/consent` | Registra aceite LGPD |
| POST | `/usuario/{user_id}/premium` | Ativa plano Premium (simula checkout) |
| DELETE | `/usuario/{user_id}/premium` | Cancela plano Premium |
| GET  | `/usuario/{user_id}/banks` | Lista conexões bancárias (ativas + inativas + billable_units) |
| POST | `/usuario/{user_id}/banks` | Adiciona nova conexão bancária (status=active) |
| DELETE | `/usuario/{user_id}/banks/{id}` | Soft-delete: status=inactive + deactivated_at registrado |
| GET  | `/saldos` | Saldos atuais por caixa |
| POST | `/dividir-pix` | Divide Pix (30/50/20 + transbordo) com rollback atômico |
| GET  | `/transactions` | Histórico de transações (limit param, max 50) |
| POST | `/v1/webhook/pix` | Endpoint Open Finance (idempotente) |

## Supabase Setup

Run scripts in order in Supabase Dashboard → SQL Editor:

1. `supabase_setup.sql` — Tabelas base: `user_balances` + `transactions`, RLS, Realtime
2. `supabase_rls_hardened.sql` — RLS restritivo: substitui `USING (true)` por `auth.uid()::text = user_id`
3. `supabase_schema_v2.sql` — Schema v2: tabela `bank_connections` + coluna `plan_cycle` em `user_balances`

Secrets: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`

## Billing Model — Stripe

- **Plano Base Mensal**: R$ 29,90/mês — inclui 1 banco conectado
- **Plano Base Anual**: R$ 29,90 × 12 × 0.93 ≈ R$ 333,45/ano (7% de desconto)
- **Banco adicional**: +R$ 7,99/mês (ou +R$ 89,15/ano com desconto)
- **Pró-rata**: `count_billable_units(user_id)` conta bancos ativos no mês corrente (mesmo inativados) menos 1 — retorna extras faturáveis incluídos no checkout

### Stripe Setup
- Secrets: `STRIPE_SECRET_KEY` (sk_test_... ou sk_live_...) e `STRIPE_WEBHOOK_SECRET` (whsec_...)
- Webhook URL: `<domínio>/api/webhook/stripe`
- Eventos Stripe a assinar: `checkout.session.completed`, `customer.subscription.deleted`
- Arquivo principal: `backend/stripe_billing.py`

### Payment Flow
1. Frontend abre `PremiumModal` com toggle Mensal/Anual
2. Ao clicar "Ativar Agora" → POST `/api/checkout/create-session` (JWT obrigatório)
3. Backend calcula `extra_banks` via `count_billable_units`, cria Stripe Session
4. Frontend recebe `checkout_url` e faz `window.location.href = checkout_url`
5. Stripe redireciona para `/pagamento-sucesso?session_id=...` ou `/pagamento-falha`
6. Stripe envia `checkout.session.completed` → `/api/webhook/stripe` → `set_premium(user_id, True)`

## Business Logic — Regra das 3 Caixas + Transbordo

- Divisão base: 30% Salário, 50% Contas, 20% Emergência
- Transbordo: quando Salário ou Contas atingem 100% da meta, o excedente vai para Emergência
- Atomicidade: se o log de transação falhar após `save_balances`, o backend restaura o saldo anterior

## Premium (R$29,90/mês)

- Simula checkout via `POST /api/usuario/{id}/premium` (grava `is_premium=true` no Supabase)
- Gated features: Simulador de Pix + Histórico completo (/transactions)
- "Ver Tudo" no feed: free → abre PremiumModal; premium → navega para /transactions

## User Flow

1. **Login** → Supabase Auth (`signInWithPassword` ou Google OAuth)
2. **Onboarding** → Define metas → `POST /api/usuario/{id}/metas`
3. **Dashboard** → `useUserStats` faz 3 fetches em paralelo (saldos + transações + status), 1 Realtime channel
4. **Simular Pix** → POST /api/dividir-pix → Supabase Realtime atualiza donut charts e feed automaticamente
5. **Ver Tudo** → se premium, navega para /transactions (lista completa, até 50 itens)
