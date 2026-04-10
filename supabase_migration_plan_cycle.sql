-- ═══════════════════════════════════════════════════════════════════════════
--  Lupe Flow — Migration: adicionar plan_cycle em user_balances
--  Idempotente: use ADD COLUMN IF NOT EXISTS (seguro para rodar múltiplas vezes).
--  Cole no SQL Editor do Supabase Dashboard e clique em "Run".
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.user_balances
  ADD COLUMN IF NOT EXISTS plan_cycle TEXT
    CHECK (plan_cycle IN ('monthly', 'yearly'))
    DEFAULT 'monthly';

-- Verificação: confirme que a coluna foi adicionada
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'user_balances'
  AND column_name  = 'plan_cycle';
