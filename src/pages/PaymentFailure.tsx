import { useNavigate } from "react-router-dom";
import { XCircle, Zap, ArrowLeft, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Displayed when the user cancels or an error occurs during Stripe Checkout. */
const PaymentFailure = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 text-center space-y-6">
      <div className="h-20 w-20 rounded-full bg-destructive/15 flex items-center justify-center">
        <XCircle className="h-10 w-10 text-destructive" />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-primary flex items-center justify-center">
            <Zap className="h-4 w-4 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-extrabold text-foreground">Lupe Flow</h1>
        </div>
        <p className="text-lg font-semibold text-destructive">Pagamento não concluído</p>
        <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
          O pagamento foi cancelado ou ocorreu um erro no processamento.
          Nenhum valor foi cobrado. Você pode tentar novamente quando quiser.
        </p>
      </div>

      <div className="flex flex-col gap-3 w-full max-w-xs">
        <Button
          variant="cta"
          size="lg"
          className="h-12 rounded-xl text-base gap-2"
          onClick={() => navigate("/dashboard")}
        >
          <RefreshCw className="h-4 w-4" />
          Tentar Novamente
        </Button>

        <Button
          variant="outline"
          size="lg"
          className="h-12 rounded-xl text-base gap-2"
          onClick={() => navigate("/dashboard")}
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar ao Dashboard
        </Button>
      </div>

      <p className="text-xs text-muted-foreground/60 max-w-xs">
        Se o problema persistir, entre em contato com o suporte.
      </p>
    </div>
  );
};

export default PaymentFailure;
