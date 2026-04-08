import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowDownLeft, Loader2, X, Sparkles, BadgeCheck, Zap } from "lucide-react";
import { toast } from "sonner";

export interface SimDeltas {
  salary: number;
  bills: number;
  emergency: number;
}

interface PixSimulatorProps {
  userId: string;
  isPremium: boolean;
  onSimulateLocal: (deltas: SimDeltas) => void;
  onClearSimulation: () => void;
  hasSimulation: boolean;
  onRequestPremium?: () => void;
}

const formatCurrency = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const round2 = (v: number) => Math.round(v * 100) / 100;

export function PixSimulator({
  userId,
  isPremium,
  onSimulateLocal,
  onClearSimulation,
  hasSimulation,
  onRequestPremium,
}: PixSimulatorProps) {
  const [amount, setAmount]           = useState("");
  const [description, setDescription] = useState("");
  const [isLoading, setIsLoading]     = useState(false);
  const [simResult, setSimResult]     = useState<SimDeltas | null>(null);

  const parseAmount = (v: string) =>
    parseFloat(v.replace(/\./g, "").replace(",", ".")) || 0;

  // ── Free: pure local 30/50/20 calculation — ZERO backend calls ───────────
  const handleSimulateFree = () => {
    const valor = parseAmount(amount);
    if (valor <= 0) {
      toast.error("Informe um valor maior que zero.");
      return;
    }
    const deltas: SimDeltas = {
      salary:    round2(valor * 0.30),
      bills:     round2(valor * 0.50),
      emergency: round2(valor * 0.20),
    };
    setSimResult(deltas);
    onSimulateLocal(deltas);
    toast.info(`Simulação de ${formatCurrency(valor)}`, {
      description: `Salário +${formatCurrency(deltas.salary)} · Contas +${formatCurrency(deltas.bills)} · Reserva +${formatCurrency(deltas.emergency)}`,
    });
  };

  const handleClear = () => {
    setSimResult(null);
    setAmount("");
    setDescription("");
    onClearSimulation();
  };

  // ── Premium: real API call — persists to Supabase, triggers Realtime ──────
  const handleSubmitPremium = async () => {
    const valor = parseAmount(amount);
    if (valor <= 0) {
      toast.error("Informe um valor maior que zero.");
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch("/api/dividir-pix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          valor_pix:   valor,
          user_id:     userId,
          description: description.trim() || "Entrada Manual",
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Erro ao registrar entrada.");
      }
      const data = await res.json();
      toast.success(`Entrada de ${formatCurrency(valor)} registrada!`, {
        description: `Salário +${formatCurrency(data.allocated_salary)} · Contas +${formatCurrency(data.allocated_bills)} · Reserva +${formatCurrency(data.allocated_emergency)}`,
      });
      setAmount("");
      setDescription("");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro ao registrar entrada.";
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = isPremium ? handleSubmitPremium : handleSimulateFree;

  return (
    <Card className={`bg-card border-border transition-colors ${!isPremium && hasSimulation ? "border-primary/40" : ""}`}>
      <CardContent className="p-4 space-y-3">

        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {isPremium ? "Lançar PIX Recebido" : "Simulador de PIX"}
            </p>
            {!isPremium && (
              <p className="text-[11px] text-muted-foreground/70 mt-0.5 leading-relaxed">
                Modo Simulação: Veja como seu dinheiro seria dividido. Valores não alteram seu saldo real.
              </p>
            )}
          </div>
          {isPremium
            ? <BadgeCheck className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            : <Sparkles className="h-4 w-4 text-amber-400/80 shrink-0 mt-0.5" />
          }
        </div>

        {/* Inputs */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-medium">
              R$
            </span>
            <Input
              type="text"
              inputMode="decimal"
              placeholder="0,00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !isLoading && handleSubmit()}
              className="pl-9 h-10 rounded-lg bg-background border-border text-sm font-bold"
              disabled={isLoading}
            />
          </div>
          {isPremium && (
            <Input
              type="text"
              placeholder="Descrição (opcional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="flex-1 h-10 rounded-lg bg-background border-border text-sm"
              disabled={isLoading}
            />
          )}
        </div>

        {/* Free simulation breakdown result */}
        {!isPremium && simResult && (
          <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 space-y-1.5">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Distribuição simulada (30 / 50 / 20)
            </p>
            <div className="grid grid-cols-3 gap-2 text-center">
              {([
                { label: "Salário",  value: simResult.salary },
                { label: "Contas",   value: simResult.bills },
                { label: "Reserva",  value: simResult.emergency },
              ] as const).map(({ label, value }) => (
                <div key={label}>
                  <p className="text-[10px] text-muted-foreground">{label}</p>
                  <p className="text-xs font-bold text-foreground">{formatCurrency(value)}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-2">
          <Button
            variant="cta"
            size="sm"
            className="flex-1 h-10 rounded-lg text-sm gap-2"
            onClick={handleSubmit}
            disabled={isLoading || !amount}
            data-testid="button-simulate-pix"
          >
            {isLoading ? (
              <><Loader2 className="h-4 w-4 animate-spin" />Processando...</>
            ) : isPremium ? (
              <><ArrowDownLeft className="h-4 w-4" />Registrar Entrada</>
            ) : (
              <><Sparkles className="h-4 w-4" />Ver Simulação</>
            )}
          </Button>

          {!isPremium && hasSimulation && (
            <Button
              variant="outline"
              size="sm"
              className="h-10 px-3 rounded-lg text-xs gap-1.5 border-border"
              onClick={handleClear}
              data-testid="button-clear-simulation"
            >
              <X className="h-3.5 w-3.5" />
              Limpar
            </Button>
          )}
        </div>

        {/* CTA for free users */}
        {!isPremium && (
          <button
            type="button"
            onClick={onRequestPremium}
            className="w-full flex items-center justify-center gap-1.5 text-[11px] text-primary/80 hover:text-primary transition-colors font-medium pt-0.5"
            data-testid="button-simulator-cta"
          >
            <Zap className="h-3 w-3" />
            Efetivar lançamentos automaticamente com o Premium
          </button>
        )}
      </CardContent>
    </Card>
  );
}
