import { useNavigate } from "react-router-dom";
import { ArrowLeft, Zap } from "lucide-react";

const TermsOfUse = () => {
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
          <h1 className="text-2xl font-extrabold tracking-tight">Termos de Uso</h1>
          <p className="text-xs text-muted-foreground">Última atualização: abril de 2026</p>
        </div>

        <div className="space-y-6 text-sm text-muted-foreground leading-relaxed">

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">1. Aceitação dos Termos</h2>
            <p>
              Ao acessar ou utilizar o Lupe Flow, você concorda com estes Termos de Uso. Se não concordar com
              qualquer parte dos termos, não utilize o serviço.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">2. Descrição do Serviço</h2>
            <p>
              O Lupe Flow é uma plataforma de gestão financeira voltada para microempreendedores. A plataforma
              automatiza a distribuição de recebimentos (PIX) em três caixas: Salário, Contas e Reserva de
              Emergência, seguindo a regra 30/50/20 ou metas customizadas pelo usuário.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">3. Cadastro e Conta</h2>
            <p>
              Para utilizar o Lupe Flow, é necessário criar uma conta com e-mail e senha válidos. Você é
              responsável por manter a confidencialidade das suas credenciais e por todas as atividades
              realizadas com sua conta.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">4. Plano Premium</h2>
            <p>
              Algumas funcionalidades são exclusivas para assinantes do plano Premium, incluindo lançamentos
              reais, conexão bancária via Open Finance e histórico mensal em PDF. A cobrança é realizada via
              Stripe, conforme o ciclo selecionado (mensal ou anual).
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">5. Limitações de Responsabilidade</h2>
            <p>
              O Lupe Flow é uma ferramenta de organização financeira e não constitui consultoria financeira,
              contábil ou jurídica. Não nos responsabilizamos por decisões financeiras tomadas com base nas
              informações exibidas na plataforma.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">6. Modificações</h2>
            <p>
              Reservamo-nos o direito de modificar estes termos a qualquer momento. Alterações relevantes
              serão comunicadas via e-mail ou notificação na plataforma. O uso continuado após as alterações
              constitui aceitação dos novos termos.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">7. Contato</h2>
            <p>
              Dúvidas sobre estes Termos de Uso? Entre em contato pelo e-mail:{" "}
              <span className="text-primary">contato@lupeflow.com.br</span>
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

export default TermsOfUse;
