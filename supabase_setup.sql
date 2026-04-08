-- ═══════════════════════════════════════════════════════════════
--  Lupe Flow — Supabase Database Setup
--  Execute este script no SQL Editor do seu projeto Supabase.
--  Supabase Dashboard → SQL Editor → New query → Run
-- ═══════════════════════════════════════════════════════════════


-- ─── 1. Tabela de saldos e metas por usuário ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_balances (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         text        NOT NULL UNIQUE,
  salary          numeric     DEFAULT 0,
  bills           numeric     DEFAULT 0,
  emergency       numeric     DEFAULT 0,
  salary_goal     numeric     DEFAULT 0,
  bills_goal      numeric     DEFAULT 0,
  emergency_goal  numeric     DEFAULT 0,
  lgpd_accepted   boolean     DEFAULT false,
  is_premium      boolean     DEFAULT false,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- Se a tabela já existia, adiciona a coluna is_premium sem erro:
ALTER TABLE public.user_balances ADD COLUMN IF NOT EXISTS is_premium boolean DEFAULT false;

-- ─── 2. Tabela de transações ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.transactions (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     text        NOT NULL,
  amount      numeric     NOT NULL,
  category    text        NOT NULL,
  description text,
  external_id text,
  created_at  timestamptz DEFAULT now()
);

-- ─── 3. Índices para performance ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_user_balances_user_id  ON public.user_balances (user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_user_id   ON public.transactions   (user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created   ON public.transactions   (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_ext_id    ON public.transactions   (external_id);

-- ─── 4. Row Level Security ───────────────────────────────────────────────────
ALTER TABLE public.user_balances  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions   ENABLE ROW LEVEL SECURITY;

-- O backend FastAPI usa a anon key e isola os dados por user_id em Python.
-- Políticas permissivas para que o backend e o frontend funcionem corretamente.
CREATE POLICY "user_balances_open" ON public.user_balances
  FOR ALL USING (true);

CREATE POLICY "transactions_open" ON public.transactions
  FOR ALL USING (true);

-- ─── 5. Realtime (atualizações ao vivo no dashboard) ────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_balances;
ALTER PUBLICATION supabase_realtime ADD TABLE public.transactions;

-- ─── 6. Trigger: atualiza updated_at automaticamente ────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_user_balances_updated_at
  BEFORE UPDATE ON public.user_balances
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
