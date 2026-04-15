import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Zap, Check, Loader2, Star, AlertCircle, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { getAccessToken } from "@/lib/supabase";
import { extractApiError } from "@/lib/apiError";

interface PremiumModalProps {
  open: boolean;
  userId: string;
  onActivated: () => void;
  onClose: () => void;
}

type PlanCycle = "monthly" | "yearly";

const BASE_MONTHLY    = 39.9;
const BASE_YEARLY_TOTAL = 445.30;

const fmt = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const FEATURES = [
  "Lançamentos reais nas 3 Caixas",
  "Divisão automática com Regra de Transbordo",
  "Histórico completo de transações",
  "Atualizações em tempo real",
  "Relatórios financeiros mensais",
  "1 conexão bancária inclusa",
];

export function PremiumModal({ open, userId, onActivated, onClose }: PremiumModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [planCycle, setPlanCycle] = useState<PlanCycle>("monthly");

  const yearlyMonthly = BASE_YEARLY_TOTAL / 12;
  const displayPrice  = planCycle === "yearly" ? yearlyMonthly : BASE_MONTHLY;

  const handleCheckout = async () => {
    setIsLoading(true);
    setInlineError(null);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("Sessão expirada. Faça login novamente.");

      const res = await fetch("/api/checkout/create-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({ user_id: userId, plan_cycle: planCycle }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(extractApiError(body, `Erro HTTP ${res.status}`));
      }

      const { checkout_url } = await res.json();
      if (!checkout_url) throw new Error("URL de checkout não retornada pelo servidor.");

      toast.info("Redirecionando para o pagamento seguro...", { duration: 2000 });
      window.location.href = checkout_url;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro desconhecido ao iniciar pagamento.";
      setInlineError(message);
      toast.error("Falha ao iniciar pagamento", { description: message });
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setInlineError(null);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="bg-card border-border max-w-sm mx-auto">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="h-10 w-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
              <Star className="h-5 w-5 text-primary" />
            </div>
            <DialogTitle className="text-foreground text-lg font-extrabold leading-tight">
              Lupe Flow Premium
            </DialogTitle>
          </div>
          <DialogDescription className="text-muted-foreground text-sm">
            Desbloqueie todo o poder da gestão financeira para o seu MEI.
          </DialogDescription>
        </DialogHeader>

        {/* ── Plan cycle toggle ─────────────────────────────────────── */}
        <div className="flex rounded-lg border border-border overflow-hidden text-sm font-semibold">
          <button
            className={`flex-1 py-2 transition-colors ${
              planCycle === "monthly"
                ? "bg-primary text-primary-foreground"
                : "bg-transparent text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setPlanCycle("monthly")}
          >
            Mensal
          </button>
          <button
            className={`flex-1 py-2 transition-colors relative ${
              planCycle === "yearly"
                ? "bg-primary text-primary-foreground"
                : "bg-transparent text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setPlanCycle("yearly")}
          >
            Anual
            <span className="ml-1.5 text-[9px] font-bold bg-emerald-500 text-white px-1.5 py-0.5 rounded-full">
              -7%
            </span>
          </button>
        </div>

        {/* ── Price display ─────────────────────────────────────────── */}
        <div className="rounded-xl bg-primary/10 border border-primary/20 p-4 text-center space-y-1">
          <p className="text-xs text-primary font-semibold uppercase tracking-wider">
            {planCycle === "yearly" ? "Plano Anual (7% de desconto)" : "Plano Mensal"}
          </p>
          <div className="flex items-baseline justify-center gap-1">
            <span className="text-muted-foreground text-sm">R$</span>
            <span className="text-4xl font-extrabold text-foreground">
              {Math.floor(displayPrice)}
            </span>
            <span className="text-xl font-bold text-foreground">
              ,{String(Math.round((displayPrice % 1) * 100)).padStart(2, "0")}
            </span>
            <span className="text-muted-foreground text-sm">/mês</span>
          </div>
          {planCycle === "yearly" && (
            <p className="text-xs text-muted-foreground">
              Cobrado {fmt(BASE_YEARLY_TOTAL)} por ano · {fmt(BASE_MONTHLY)}/mês sem desconto
            </p>
          )}
          {planCycle === "monthly" && (
            <p className="text-xs text-muted-foreground">Cancele quando quiser</p>
          )}
        </div>

        {/* ── Features ──────────────────────────────────────────────── */}
        <ul className="space-y-2">
          {FEATURES.map((f) => (
            <li key={f} className="flex items-center gap-2.5 text-sm text-foreground">
              <div className="h-5 w-5 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                <Check className="h-3 w-3 text-primary" />
              </div>
              {f}
            </li>
          ))}
        </ul>

        {/* ── Inline error ──────────────────────────────────────────── */}
        {inlineError && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
            <p className="text-xs text-destructive leading-relaxed break-all">{inlineError}</p>
          </div>
        )}

        {/* ── CTA ───────────────────────────────────────────────────── */}
        <Button
          variant="cta"
          size="lg"
          className="w-full h-12 rounded-xl text-base gap-2"
          onClick={handleCheckout}
          disabled={isLoading}
          data-testid="button-activate-premium"
        >
          {isLoading ? (
            <><Loader2 className="h-4 w-4 animate-spin" />Aguarde...</>
          ) : (
            <><Zap className="h-4 w-4" />Ativar Agora<ExternalLink className="h-3.5 w-3.5 opacity-70" /></>
          )}
        </Button>

        <p className="text-[10px] text-muted-foreground/60 text-center -mt-1">
          Pagamento seguro via Stripe · SSL · Cancele quando quiser
        </p>

        <button
          onClick={handleClose}
          className="text-xs text-center text-muted-foreground hover:text-foreground transition-colors w-full"
          disabled={isLoading}
        >
          Continuar sem Premium
        </button>
      </DialogContent>
    </Dialog>
  );
}
