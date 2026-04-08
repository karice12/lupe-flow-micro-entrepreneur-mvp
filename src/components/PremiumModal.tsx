import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Zap, Check, Loader2, Star } from "lucide-react";
import { toast } from "sonner";

interface PremiumModalProps {
  open: boolean;
  userId: string;
  onActivated: () => void;
  onClose: () => void;
}

const FEATURES = [
  "Simulador de Pix ilimitado",
  "Divisão automática das 3 Caixas",
  "Regra de Transbordo inteligente",
  "Histórico completo de transações",
  "Atualizações em tempo real",
  "Relatórios financeiros mensais",
];

export function PremiumModal({ open, userId, onActivated, onClose }: PremiumModalProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleActivate = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/usuario/${encodeURIComponent(userId)}/premium`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Falha ao ativar assinatura.");
      toast.success("🎉 Assinatura Premium ativada!", {
        description: "Bem-vindo ao Lupe Flow Premium!",
      });
      onActivated();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro ao ativar assinatura.";
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
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

        {/* Price */}
        <div className="rounded-xl bg-primary/10 border border-primary/20 p-4 text-center space-y-1">
          <p className="text-xs text-primary font-semibold uppercase tracking-wider">Plano Mensal</p>
          <div className="flex items-baseline justify-center gap-1">
            <span className="text-muted-foreground text-sm">R$</span>
            <span className="text-4xl font-extrabold text-foreground">29</span>
            <span className="text-xl font-bold text-foreground">,90</span>
            <span className="text-muted-foreground text-sm">/mês</span>
          </div>
          <p className="text-xs text-muted-foreground">Cancele quando quiser</p>
        </div>

        {/* Features */}
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

        <Button
          variant="cta"
          size="lg"
          className="w-full h-12 rounded-xl text-base gap-2"
          onClick={handleActivate}
          disabled={isLoading}
          data-testid="button-activate-premium"
        >
          {isLoading ? (
            <><Loader2 className="h-4 w-4 animate-spin" />Ativando...</>
          ) : (
            <><Zap className="h-4 w-4" />Ativar Agora — R$ 29,90</>
          )}
        </Button>

        <button
          onClick={onClose}
          className="text-xs text-center text-muted-foreground hover:text-foreground transition-colors w-full"
          disabled={isLoading}
        >
          Continuar sem Premium
        </button>
      </DialogContent>
    </Dialog>
  );
}
