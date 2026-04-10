-- ═══════════════════════════════════════════════════════════════════════════
--  Lupe Flow — Schema: Fechamento Mensal (monthly_summaries)
--  Cole no SQL Editor do Supabase e clique em "Run".
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.monthly_summaries (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           TEXT          NOT NULL,
  reference_month   TEXT          NOT NULL,        -- formato: 'YYYY-MM'
  salary_snapshot   NUMERIC(12,2) NOT NULL DEFAULT 0,
  bills_snapshot    NUMERIC(12,2) NOT NULL DEFAULT 0,
  emergency_snapshot NUMERIC(12,2) NOT NULL DEFAULT 0,
  salary_goal       NUMERIC(12,2) NOT NULL DEFAULT 0,
  bills_goal        NUMERIC(12,2) NOT NULL DEFAULT 0,
  emergency_goal    NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_income      NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  UNIQUE (user_id, reference_month)
);

CREATE INDEX IF NOT EXISTS monthly_summaries_user_id_idx
  ON public.monthly_summaries (user_id, reference_month DESC);

ALTER TABLE public.monthly_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "monthly_summaries_select"
  ON public.monthly_summaries FOR SELECT
  USING (auth.uid()::text = user_id);

CREATE POLICY "monthly_summaries_insert"
  ON public.monthly_summaries FOR INSERT
  WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "monthly_summaries_update"
  ON public.monthly_summaries FOR UPDATE
  USING (auth.uid()::text = user_id)
  WITH CHECK (auth.uid()::text = user_id);
