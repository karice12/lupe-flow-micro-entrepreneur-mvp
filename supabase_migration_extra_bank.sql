-- ═══════════════════════════════════════════════════════════════════════════
--  Lupe Flow — Migration: extra_bank flag em user_balances
--  Cole no SQL Editor do Supabase e clique em "Run".
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.user_balances
  ADD COLUMN IF NOT EXISTS extra_bank BOOLEAN NOT NULL DEFAULT FALSE;
