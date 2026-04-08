import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowDownLeft, Loader2, Lock } from "lucide-react";
import { toast } from "sonner";

interface PixSimulatorProps {
  userId: string;
  isPremium: boolean;
  onRequestPremium: () => void;
}

const formatCurrency = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function PixSimulator({ userId, isPremium, onRequestPremium }: PixSimulatorProps) {
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const parseAmount = (v: string) =>
    parseFloat(v.replace(/\./g, "").replace(",", ".")) || 0;

  const handleSimulate = async () => {
    if (!isPremium) {
      onRequestPremium();
      return;
    }

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
          valor_pix: valor,
          user_id: userId,
          description: description.trim() || "Pix Simulado",
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Erro ao processar Pix.");
      }

      const data = await res.json();
      toast.success(`Pix de ${formatCurrency(valor)} distribuído!`, {
        description: `Salário +${formatCurrency(data.allocated_salary)} · Contas +${formatCurrency(data.allocated_bills)} · Reserva +${formatCurrency(data.allocated_emergency)}`,
      });

      setAmount("");
      setDescription("");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro ao simular Pix.";
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="bg-card border-border">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Simular Pix Recebido
          </p>
          {!isPremium && (
            <div className="flex items-center gap-1 text-xs text-amber-400 font-medium">
              <Lock className="h-3 w-3" />
              Premium
            </div>
          )}
        </div>

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
              onKeyDown={(e) => e.key === "Enter" && !isLoading && handleSimulate()}
              className="pl-9 h-10 rounded-lg bg-background border-border text-sm font-bold"
              disabled={isLoading}
            />
          </div>
          <Input
            type="text"
            placeholder="Descrição (opcional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="flex-1 h-10 rounded-lg bg-background border-border text-sm"
            disabled={isLoading}
          />
        </div>

        <Button
          variant="cta"
          size="sm"
          className="w-full h-10 rounded-lg text-sm gap-2"
          onClick={handleSimulate}
          disabled={isLoading || (!isPremium ? false : !amount)}
          data-testid="button-simulate-pix"
        >
          {isLoading ? (
            <><Loader2 className="h-4 w-4 animate-spin" />Processando...</>
          ) : !isPremium ? (
            <><Lock className="h-4 w-4" />Desbloquear Simulador</>
          ) : (
            <><ArrowDownLeft className="h-4 w-4" />Simular Pix</>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
