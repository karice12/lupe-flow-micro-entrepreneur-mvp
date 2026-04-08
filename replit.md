# Lupe Flow — Production Ready

Micro-SaaS financeiro para microempreendedores. Frontend React + Backend Python/FastAPI com Supabase (PostgreSQL) como banco de dados exclusivo.

## Architecture

- **Frontend**: React 18 + TypeScript + Vite (port 5000)
- **Backend**: Python 3.11 + FastAPI + Uvicorn (port 8000)
- **Database**: Supabase (PostgreSQL) — sem fallback em memória, erros explícitos
- **Styling**: Tailwind CSS + shadcn/ui (Dark Mode Premium, laranja/âmbar)
- **Routing**: React Router DOM v6
- **State**: GoalsContext (userId + goals)

## Running

Two workflows start automatically:
- **Start application** — `npm run dev` on port 5000 (webview, proxies `/api/*` to backend)
- **Backend API** — `python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload` (console)

## Project Structure

```
src/
  App.tsx
  contexts/GoalsContext.tsx     # userId + goals shared state
  pages/
    Auth.tsx                    # Login → checks Supabase → routes to dashboard or onboarding
    Onboarding.tsx              # Saves goals to Supabase via POST /api/usuario/{id}/metas
    Index.tsx                   # Dashboard — loads from Supabase on mount, no mock data
    NotFound.tsx

backend/
  main.py                       # FastAPI routes (health, usuario, saldos, dividir-pix)
  models.py                     # PixRequest, PixResponse, UserGoalsRequest, UserStatusResponse
  storage.py                    # Supabase CRUD — raises HTTP 503 on failure, no in-memory fallback
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Backend health check |
| GET | `/usuario/{user_id}` | Check if user exists and has goals set |
| POST | `/usuario/{user_id}/metas` | Save/update user goals in Supabase |
| GET | `/saldos` | Get current balances from Supabase |
| POST | `/dividir-pix` | Split Pix value (30/50/20 + overflow), save to Supabase |

## Supabase Setup

Required table `user_balances`:
```sql
user_id TEXT PRIMARY KEY,
salary FLOAT DEFAULT 0,
bills FLOAT DEFAULT 0,
emergency FLOAT DEFAULT 0,
salary_goal FLOAT DEFAULT 0,
bills_goal FLOAT DEFAULT 0,
emergency_goal FLOAT DEFAULT 0
```

Secrets required: `SUPABASE_URL`, `SUPABASE_ANON_KEY`

## User Flow

1. **Login** → Auth page calls `GET /api/usuario/{email}` to check Supabase
   - Has goals → goes directly to Dashboard
   - No goals → goes to Onboarding
2. **Onboarding** → Saves goals via `POST /api/usuario/{id}/metas`
3. **Dashboard** → Loads balances on mount, Simular Pix calls `POST /api/dividir-pix`

## Business Logic — Regra das 3 Caixas + Transbordo

- Base: 30% Salário, 50% Contas, 20% Emergência
- Transbordo: se Salário ou Contas excedem a meta, o excedente vai para Emergência
