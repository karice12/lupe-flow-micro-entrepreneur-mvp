# Lupe Flow

A Micro-SaaS financeiro para microempreendedores. Frontend React + Backend Python/FastAPI com lógica de divisão de Pix (3 Caixas + Transbordo) e integração Supabase.

## Architecture

- **Frontend**: React 18 + TypeScript + Vite (port 5000)
- **Backend**: Python 3.11 + FastAPI + Uvicorn (port 8000)
- **Database**: Supabase (PostgreSQL) — in-memory fallback when env vars not set
- **Styling**: Tailwind CSS + shadcn/ui (Dark Mode Premium, laranja/âmbar)
- **Routing**: React Router DOM v6
- **State**: React Context (GoalsContext)

## Project Structure

```
src/
  App.tsx              - Root with routing
  main.tsx             - Entry point
  index.css            - Global styles + Tailwind
  pages/
    Auth.tsx           - Login/signup page
    Index.tsx          - Dashboard (calls backend /api/dividir-pix)
    Onboarding.tsx     - Goals setup flow
    NotFound.tsx       - 404 page
  components/
    NavLink.tsx
    ui/                - shadcn/ui components
  contexts/
    GoalsContext.tsx   - Salary/Bills/Emergency goals state
  hooks/
    use-mobile.tsx
    use-toast.ts
  lib/
    utils.ts

backend/
  __init__.py
  main.py              - FastAPI app, CORS, /dividir-pix endpoint
  models.py            - Pydantic models (PixRequest, PixResponse, BoxBalance)
  storage.py           - Supabase storage + in-memory fallback
```

## Running the App

Two workflows run simultaneously:
- **Start application** — `npm run dev` on port 5000 (webview)
- **Backend API** — `python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload` (console)

Vite proxies `/api/*` → `http://localhost:8000` so the frontend calls `/api/dividir-pix`.

## Business Logic — Regra das 3 Caixas

`POST /api/dividir-pix` receives `valor_pix`, `user_id`, and optional goals.

1. Base split: 30% Salário, 50% Contas, 20% Emergência
2. **Transbordo**: If Salário or Contas would exceed their goal, the excess overflows into Emergência

## Supabase Setup

Set these secrets in Replit to enable persistent storage:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

Required table: `user_balances` with columns:
`user_id (text PK), salary (float), bills (float), emergency (float), salary_goal (float), bills_goal (float), emergency_goal (float)`

Without these secrets, the app uses in-memory storage (resets on restart).
