import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle2, Loader2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGoals } from "@/contexts/GoalsContext";

/** Displayed after a successful Stripe Checkout redirect. */
const PaymentSuccess = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { setIsPremium } = useGoals();
  const [countdown, setCountdown] = useState(5);

  const sessionId = searchParams.get("session_id");

  useEffect(() => {
    // Optimistically mark premium in the local context.
    // The authoritative activation happens via the Stripe webhook on the backend.
    setIsPremium(true);
  }, [setIsPremium]);

  useEffect(() => {
    if (countdown <= 0) {
      navigate("/dashboard");
      return;
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown, navigate]);

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 text-center space-y-6">
      <div className="h-20 w-20 rounded-full bg-emerald-500/15 flex items-center justify-center">
        <CheckCircle2 className="h-10 w-10 text-emerald-400" />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-primary flex items-center justify-center">
            <Zap className="h-4 w-4 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-extrabold text-foreground">Lupe Flow Premium</h1>
        </div>
        <p className="text-lg font-semibold text-emerald-400">Pagamento confirmado!</p>
        <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
          Sua assinatura foi ativada com sucesso. Agora você tem acesso completo
          a todas as funcionalidades Premium.
        </p>
        {sessionId && (
          <p className="text-[10px] text-muted-foreground/40 font-mono break-all">
            ref: {sessionId}
          </p>
        )}
      </div>

      <div className="flex flex-col items-center gap-3">
        <Button
          variant="cta"
          size="lg"
          className="h-12 px-8 rounded-xl text-base gap-2"
          onClick={() => navigate("/dashboard")}
        >
          <Zap className="h-4 w-4" />
          Ir para o Dashboard
        </Button>

        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Redirecionando automaticamente em {countdown}s...
        </p>
      </div>
    </div>
  );
};

export default PaymentSuccess;
