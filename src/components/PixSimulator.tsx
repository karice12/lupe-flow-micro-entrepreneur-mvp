import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowDownLeft, Loader2, BadgeCheck, Star } from "lucide-react";
import { toast } from "sonner";
import { getAccessToken } from "@/lib/supabase";

interface PixEntryCardProps {
  userId: string;
  isPremium: boolean;
  onRequestPremium?: () => void;
}

const formatCurrency = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function PixSimulator({ userId, isPremium, onRequestPremium }: PixEntryCardProps) {
  const [amount, setAmount]           = useState("");
  const [description, setDescription] = useState("");
  const [isLoading, setIsLoading]     = useState(false);

  const parseAmount = (v: string) =>
    parseFloat(v.replace(/\./g, "").replace(",", ".")) || 0;

  const handleSubmit = async () => {
    const valor = parseAmount(amount);
    if (valor <= 0) {
      toast.error("Informe um valor maior que zero.");
      return;
    }
    setIsLoading(true);
    try {
      const token = await getAccessToken();
      if (!token) {
        toast.error("Sessão expirada. Faça login novamente.");
        return;
      }
      const res = await fetch("/api/dividir-pix", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({
          valor_pix:   valor,
          user_id:     userId,
          description: description.trim() || "Entrada Manual",
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.detail || "Erro ao registrar entrada.");
        return;
      }
      const data = await res.json().catch(() => ({ allocated_salary: 0, allocated_bills: 0, allocated_emergency: 0 }));
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

  if (!isPremium) {
    return (
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Star className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">Registre entradas reais</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                Com o Premium, cada PIX recebido é lançado diretamente nas suas caixas e sincronizado em tempo real.
              </p>
            </div>
          </div>
          <Button
            variant="cta"
            size="sm"
            className="w-full h-10 rounded-lg text-sm"
            onClick={onRequestPremium}
            data-testid="button-upgrade-pix"
          >
            Assinar Premium para lançar entradas
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card border-border">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Lançar PIX Recebido
          </p>
          <BadgeCheck className="h-4 w-4 text-primary shrink-0" />
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
              onKeyDown={(e) => e.key === "Enter" && !isLoading && handleSubmit()}
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
          onClick={handleSubmit}
          disabled={isLoading || !amount}
          data-testid="button-register-pix"
        >
          {isLoading ? (
            <><Loader2 className="h-4 w-4 animate-spin" />Processando...</>
          ) : (
            <><ArrowDownLeft className="h-4 w-4" />Registrar Entrada</>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
