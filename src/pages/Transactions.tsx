import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowDownLeft, Wallet, ShieldCheck, Receipt, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGoals } from "@/contexts/GoalsContext";
import type { TxItem } from "@/hooks/useUserStats";

const formatCurrency = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const formatTxDate = (iso: string) => {
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit", month: "2-digit",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
};

const CATEGORY_META: Record<string, { label: string; icon: React.ReactNode }> = {
  salario: { label: "Salário",    icon: <Wallet className="h-4 w-4" /> },
  contas:  { label: "Contas",     icon: <Receipt className="h-4 w-4" /> },
  reserva: { label: "Emergência", icon: <ShieldCheck className="h-4 w-4" /> },
};

const Transactions = () => {
  const navigate      = useNavigate();
  const { userId, isPremium, isAuthReady } = useGoals();

  const [items, setItems]         = useState<TxItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // ── Auth + premium guard ────────────────────────────────────────────────
  useEffect(() => {
    if (!isAuthReady) return;
    if (!userId)    { navigate("/");          return; }
    if (!isPremium) { navigate("/dashboard"); return; }
  }, [isAuthReady, userId, isPremium, navigate]);

  const fetchAll = useCallback(async (silent = false) => {
    if (!userId) return;
    if (silent) setIsRefreshing(true);
    else setIsLoading(true);

    try {
      const res = await fetch(`/api/transactions?user_id=${encodeURIComponent(userId)}&limit=50`);
      if (!res.ok) return;
      const data = await res.json();
      setItems(data.transactions || []);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [userId]);

  useEffect(() => {
    if (userId && isPremium) fetchAll();
  }, [fetchAll, userId, isPremium]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="flex-1 max-w-md mx-auto w-full px-4 py-6 space-y-5">

        {/* Header */}
        <header className="flex items-center gap-3">
          <button
            onClick={() => navigate("/dashboard")}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Voltar"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-lg font-extrabold tracking-tight text-foreground flex-1">
            Histórico Completo
          </h1>
          <button
            onClick={() => fetchAll(true)}
            disabled={isRefreshing || isLoading}
            className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
            aria-label="Atualizar"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
          </button>
        </header>

        {/* Count badge */}
        {!isLoading && items.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {items.length} {items.length === 1 ? "transação encontrada" : "transações encontradas"}
          </p>
        )}

        {/* List */}
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-16 rounded-xl bg-card border border-border animate-pulse" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-xl bg-card border border-border p-8 text-center space-y-2">
            <div className="mx-auto h-10 w-10 rounded-full bg-muted flex items-center justify-center">
              <ArrowDownLeft className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground">Nenhuma transação ainda</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Simule um Pix no dashboard para começar.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => navigate("/dashboard")}
            >
              Ir para o Dashboard
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((tx) => {
              const meta = CATEGORY_META[tx.category] ?? {
                label: tx.category,
                icon: <ArrowDownLeft className="h-4 w-4" />,
              };
              return (
                <div
                  key={tx.id}
                  className="flex items-center justify-between rounded-xl bg-card border border-border p-3 gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-9 w-9 rounded-full bg-primary/15 text-primary flex items-center justify-center shrink-0">
                      {meta.icon}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">
                        {tx.description || "Pix Recebido"}
                      </p>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs text-primary font-medium">{meta.label}</span>
                        <span className="text-muted-foreground/40 text-xs">·</span>
                        <span className="text-xs text-muted-foreground">{formatTxDate(tx.created_at)}</span>
                      </div>
                    </div>
                  </div>
                  <span className="text-sm font-bold text-primary shrink-0">
                    +{formatCurrency(tx.amount)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default Transactions;
