-- ═══════════════════════════════════════════════════════════════════════════
--  Lupe Flow — RLS Hardened Policies
--  Cole este script inteiro no SQL Editor do Supabase e clique em "Run".
--  Supabase Dashboard → SQL Editor → New query → Run
--
--  O que este script faz:
--  1. Remove as políticas permissivas antigas (USING true)
--  2. Cria políticas restritivas por operação (SELECT / INSERT / UPDATE)
--     onde cada usuário só acessa as suas próprias linhas via auth.uid()
--
--  NOTA: O backend FastAPI usa a Service Role Key, que bypassa o RLS
--  completamente — estas políticas protegem acesso direto via anon key
--  (ex: SDK do Supabase no frontend, Postman, etc.)
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── 1. Remover políticas abertas anteriores ─────────────────────────────────

DROP POLICY IF EXISTS "user_balances_open" ON public.user_balances;
DROP POLICY IF EXISTS "transactions_open"  ON public.transactions;


-- ─── 2. Políticas restritivas para user_balances ─────────────────────────────

-- SELECT: só pode ver sua própria linha
CREATE POLICY "user_balances_select"
  ON public.user_balances
  FOR SELECT
  USING (auth.uid()::text = user_id);

-- INSERT: só pode inserir linha com o próprio user_id
CREATE POLICY "user_balances_insert"
  ON public.user_balances
  FOR INSERT
  WITH CHECK (auth.uid()::text = user_id);

-- UPDATE: só pode atualizar sua própria linha
CREATE POLICY "user_balances_update"
  ON public.user_balances
  FOR UPDATE
  USING     (auth.uid()::text = user_id)
  WITH CHECK (auth.uid()::text = user_id);

-- DELETE: intencionalmente bloqueado para usuários finais
-- (apenas a service role key pode deletar via backend)


-- ─── 3. Políticas restritivas para transactions ───────────────────────────────

-- SELECT: só vê suas próprias transações
CREATE POLICY "transactions_select"
  ON public.transactions
  FOR SELECT
  USING (auth.uid()::text = user_id);

-- INSERT: só pode inserir transação com o próprio user_id
CREATE POLICY "transactions_insert"
  ON public.transactions
  FOR INSERT
  WITH CHECK (auth.uid()::text = user_id);

-- UPDATE / DELETE: bloqueados para usuários finais
-- (imutabilidade do histórico financeiro)


-- ─── 4. Verificação final ─────────────────────────────────────────────────────
-- Execute esta query separadamente para confirmar que as políticas foram criadas:
--
-- SELECT schemaname, tablename, policyname, cmd, qual
-- FROM   pg_policies
-- WHERE  tablename IN ('user_balances', 'transactions')
-- ORDER  BY tablename, policyname;
