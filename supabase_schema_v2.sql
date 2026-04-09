-- ═══════════════════════════════════════════════════════════════════════════
--  Lupe Flow — Schema v2: Conexões Bancárias + Ciclo de Plano
--  Cole no SQL Editor do Supabase e clique em "Run".
--
--  O que este script faz:
--  1. Adiciona coluna plan_cycle em user_balances
--  2. Cria a tabela bank_connections (soft-delete por status)
--  3. Habilita RLS em bank_connections com políticas por auth.uid()
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── 1. Adicionar plan_cycle em user_balances ────────────────────────────────

ALTER TABLE public.user_balances
  ADD COLUMN IF NOT EXISTS plan_cycle TEXT
    CHECK (plan_cycle IN ('monthly', 'yearly'))
    DEFAULT 'monthly';


-- ─── 2. Criar tabela bank_connections ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.bank_connections (
  id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        TEXT          NOT NULL,
  bank_name      TEXT          NOT NULL,
  status         TEXT          NOT NULL DEFAULT 'active'
                               CHECK (status IN ('active', 'inactive')),
  provider_id    TEXT,
  activated_at   TIMESTAMPTZ   NOT NULL DEFAULT now(),
  deactivated_at TIMESTAMPTZ
);

-- Index for fast per-user queries
CREATE INDEX IF NOT EXISTS bank_connections_user_id_idx
  ON public.bank_connections (user_id);

-- Index for billing queries (active connections in a date range)
CREATE INDEX IF NOT EXISTS bank_connections_user_status_idx
  ON public.bank_connections (user_id, status);


-- ─── 3. Habilitar RLS em bank_connections ────────────────────────────────────

ALTER TABLE public.bank_connections ENABLE ROW LEVEL SECURITY;

-- SELECT: cada usuário vê apenas suas próprias conexões
CREATE POLICY "bank_connections_select"
  ON public.bank_connections
  FOR SELECT
  USING (auth.uid()::text = user_id);

-- INSERT: só pode inserir com o próprio user_id
CREATE POLICY "bank_connections_insert"
  ON public.bank_connections
  FOR INSERT
  WITH CHECK (auth.uid()::text = user_id);

-- UPDATE: pode atualizar somente suas próprias conexões (para inativar)
CREATE POLICY "bank_connections_update"
  ON public.bank_connections
  FOR UPDATE
  USING     (auth.uid()::text = user_id)
  WITH CHECK (auth.uid()::text = user_id);

-- DELETE bloqueado — usamos soft-delete via status = 'inactive'


-- ─── 4. Verificação final ─────────────────────────────────────────────────────
-- Execute separadamente para confirmar:
--
-- SELECT column_name, data_type, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'user_balances' AND column_name = 'plan_cycle';
--
-- SELECT table_name, policyname, cmd, qual
-- FROM pg_policies
-- WHERE tablename = 'bank_connections'
-- ORDER BY policyname;
