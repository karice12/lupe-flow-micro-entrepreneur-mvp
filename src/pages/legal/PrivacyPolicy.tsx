import { useNavigate } from "react-router-dom";
import { ArrowLeft, Zap } from "lucide-react";

const PrivacyPolicy = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">

        <header className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-primary flex items-center justify-center">
              <Zap className="h-3.5 w-3.5 text-primary-foreground" />
            </div>
            <span className="font-bold text-foreground">Lupe Flow</span>
          </div>
        </header>

        <div className="space-y-2">
          <h1 className="text-2xl font-extrabold tracking-tight">Política de Privacidade</h1>
          <p className="text-xs text-muted-foreground">Última atualização: abril de 2026</p>
        </div>

        <div className="space-y-6 text-sm text-muted-foreground leading-relaxed">

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">1. Quais dados coletamos</h2>
            <p>
              Coletamos apenas os dados necessários para a prestação do serviço: endereço de e-mail, dados
              financeiros inseridos voluntariamente (valores de PIX e metas), e informações de conexão
              bancária quando o Open Finance é habilitado.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">2. Como usamos seus dados</h2>
            <p>
              Seus dados são utilizados exclusivamente para operar a plataforma: calcular distribuições de
              recebimentos, gerar relatórios mensais e processar cobranças de assinatura. Não vendemos,
              alugamos nem compartilhamos seus dados com terceiros para fins publicitários.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">3. Armazenamento e segurança</h2>
            <p>
              Todos os dados são armazenados na infraestrutura Supabase, com criptografia em repouso e em
              trânsito (TLS). O acesso ao banco de dados é protegido por Row Level Security (RLS), garantindo
              que cada usuário acesse apenas seus próprios dados.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">4. Open Finance e Pluggy</h2>
            <p>
              A conexão bancária é realizada via Pluggy, uma instituição regulada pelo Banco Central do
              Brasil no âmbito do Open Finance. As credenciais bancárias nunca são armazenadas no Lupe Flow —
              apenas tokens de leitura de saldo são mantidos.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">5. Seus direitos (LGPD)</h2>
            <p>
              Em conformidade com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018), você tem direito a:
              acessar, corrigir, exportar e solicitar a exclusão dos seus dados a qualquer momento. Para
              exercer esses direitos, entre em contato pelo e-mail abaixo.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">6. Retenção de dados</h2>
            <p>
              Seus dados são retidos enquanto sua conta estiver ativa. Após a exclusão da conta, os dados são
              removidos permanentemente em até 30 dias, exceto onde a retenção for exigida por obrigação legal.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">7. Contato e DPO</h2>
            <p>
              Para solicitações de privacidade ou dúvidas sobre esta política, entre em contato pelo e-mail:{" "}
              <span className="text-primary">privacidade@lupeflow.com.br</span>
            </p>
          </section>

        </div>

        <div className="border-t border-border pt-6 text-xs text-muted-foreground/60 text-center">
          © {new Date().getFullYear()} Lupe Flow. Todos os direitos reservados.
        </div>

      </div>
    </div>
  );
};

export default PrivacyPolicy;
