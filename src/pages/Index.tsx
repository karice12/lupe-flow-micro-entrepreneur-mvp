import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import {
  Wallet, ShieldCheck, Receipt,
  ArrowDownLeft, Zap, LogOut, RefreshCw, Radio, Star,
} from "lucide-react";
import { toast } from "sonner";
import { useGoals } from "@/contexts/GoalsContext";
import { LgpdFooter } from "@/components/LgpdFooter";
import { PremiumModal } from "@/components/PremiumModal";
import { PixSimulator } from "@/components/PixSimulator";
import { getSupabaseClient } from "@/lib/supabase";

interface BoxState {
  name: string;
  accumulated: number;
  goal: number;
  icon: React.ReactNode;
}

interface TxItem {
  id: string;
  amount: number;
  category: string;
  description: string | null;
  created_at: string;
}

const formatCurrency = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const formatTime = (d: Date) =>
  d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

const formatTxDate = (iso: string) => {
  try {
    const d = new Date(iso);
    return d.toLocaleString("pt-BR", {
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

const buildBoxes = (
  salary: number, bills: number, emergency: number,
  salaryGoal: number, billsGoal: number, emergencyGoal: number,
): BoxState[] => [
  { name: "Salário",    accumulated: salary,    goal: salaryGoal,    icon: <Wallet className="h-5 w-5" /> },
  { name: "Contas",     accumulated: bills,     goal: billsGoal,     icon: <Receipt className="h-5 w-5" /> },
  { name: "Emergência", accumulated: emergency, goal: emergencyGoal, icon: <ShieldCheck className="h-5 w-5" /> },
];

const Index = () => {
  const navigate = useNavigate();
  const { userId, goals, isPremium, isAuthReady, setIsPremium, signOut } = useGoals();

  useEffect(() => {
    if (isAuthReady && !userId) {
      navigate("/");
    }
  }, [isAuthReady, userId, navigate]);

  const salaryGoal    = goals?.salary    ?? 3000;
  const billsGoal     = goals?.bills     ?? 1500;
  const emergencyGoal = goals?.emergency ?? 10000;

  const [boxes, setBoxes]               = useState<BoxState[]>(buildBoxes(0, 0, 0, salaryGoal, billsGoal, emergencyGoal));
  const [transactions, setTransactions] = useState<TxItem[]>([]);
  const [isFetching, setIsFetching]     = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated]   = useState<Date | null>(null);
  const [realtimeOk, setRealtimeOk]     = useState(false);
  const [showPremiumModal, setShowPremiumModal] = useState(false);
  const channelRef = useRef<ReturnType<Awaited<ReturnType<typeof getSupabaseClient>>["channel"]> | null>(null);
  const totalBalance = boxes.reduce((s, b) => s + b.accumulated, 0);

  const fetchBalances = useCallback(async (silent = false) => {
    if (!userId) return;
    if (!silent) setIsFetching(true);
    else setIsRefreshing(true);

    const params = new URLSearchParams({
      user_id:        userId,
      salary_goal:    String(salaryGoal),
      bills_goal:     String(billsGoal),
      emergency_goal: String(emergencyGoal),
    });

    try {
      const res = await fetch(`/api/saldos?${params}`);
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.detail || "Erro ao carregar saldos.");
      }
      const data = await res.json();
      setBoxes(buildBoxes(
        data.salary, data.bills, data.emergency,
        data.salary_goal, data.bills_goal, data.emergency_goal,
      ));
      setLastUpdated(new Date());
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Não foi possível carregar os saldos.";
      toast.error(message);
    } finally {
      setIsFetching(false);
      setIsRefreshing(false);
    }
  }, [userId, salaryGoal, billsGoal, emergencyGoal]);

  const fetchTransactions = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await fetch(`/api/transactions?user_id=${encodeURIComponent(userId)}&limit=5`);
      if (!res.ok) return;
      const data = await res.json();
      setTransactions(data.transactions || []);
    } catch {
      // silent failure — feed is non-critical
    }
  }, [userId]);

  // ── Load premium status on mount (for page refresh case) ────────────────
  useEffect(() => {
    if (!userId) return;
    fetch(`/api/usuario/${encodeURIComponent(userId)}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data) setIsPremium(!!data.is_premium);
      })
      .catch(() => {});
  }, [userId, setIsPremium]);

  // ── Initial load ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!userId) return;
    fetchBalances();
    fetchTransactions();
  }, [fetchBalances, fetchTransactions, userId]);

  // ── Supabase Realtime ────────────────────────────────────────────────────
  useEffect(() => {
    if (!userId) return;
    let active = true;

    getSupabaseClient().then((sb) => {
      if (!sb || !active) return;

      const channel = sb
        .channel(`lupe-${userId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "transactions",
            filter: `user_id=eq.${userId}`,
          },
          (payload) => {
            const row = payload.new as TxItem;
            setTransactions((prev) => [row, ...prev].slice(0, 5));
            fetchBalances(true);
            const meta = CATEGORY_META[row.category];
            toast.success(
              `+${formatCurrency(row.amount)} → ${meta?.label ?? row.category}`,
              { description: row.description ?? "Pix processado" },
            );
          },
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "user_balances",
            filter: `user_id=eq.${userId}`,
          },
          (payload) => {
            const d = payload.new as Record<string, number>;
            setBoxes(buildBoxes(
              d.salary, d.bills, d.emergency,
              d.salary_goal ?? salaryGoal,
              d.bills_goal  ?? billsGoal,
              d.emergency_goal ?? emergencyGoal,
            ));
            setLastUpdated(new Date());
          },
        )
        .subscribe((status) => {
          setRealtimeOk(status === "SUBSCRIBED");
        });

      channelRef.current = channel as never;
    });

    return () => {
      active = false;
      getSupabaseClient().then((sb) => {
        if (sb && channelRef.current) {
          sb.removeChannel(channelRef.current as never);
          channelRef.current = null;
        }
      });
      setRealtimeOk(false);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="flex-1 max-w-md mx-auto w-full px-4 py-6 space-y-6">

        {/* Header */}
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
              <Zap className="h-4 w-4 text-primary-foreground" />
            </div>
            <h1 className="text-xl font-extrabold tracking-tight text-foreground">Lupe Flow</h1>
            {isPremium && (
              <span className="flex items-center gap-1 text-[10px] font-bold text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-full">
                <Star className="h-2.5 w-2.5" />
                PREMIUM
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Saldo total</p>
              <p className="text-lg font-bold text-foreground">
                {isFetching
                  ? <span className="text-muted-foreground text-sm animate-pulse">Carregando...</span>
                  : formatCurrency(totalBalance)
                }
              </p>
            </div>
            <button
              onClick={async () => { await signOut(); navigate("/"); }}
              className="text-muted-foreground hover:text-foreground transition-colors"
              title="Sair"
              data-testid="button-logout"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </header>

        {/* Premium upgrade banner (shown when not premium) */}
        {!isPremium && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="p-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <Star className="h-4 w-4 text-primary shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">Ative o Lupe Flow Premium</p>
                  <p className="text-xs text-muted-foreground truncate">Simulador, histórico e realtime por R$ 29,90/mês</p>
                </div>
              </div>
              <Button
                variant="cta"
                size="sm"
                className="shrink-0 h-8 px-3 text-xs rounded-lg"
                onClick={() => setShowPremiumModal(true)}
                data-testid="button-upgrade"
              >
                Assinar
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Connection + Realtime status banner */}
        <Card className="border-emerald-500/20 bg-emerald-500/5">
          <CardContent className="p-3 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
              </span>
              <span className="text-sm font-medium text-emerald-400">
                Conectado à sua conta bancária
              </span>
            </div>
            <div className="flex items-center gap-3">
              {realtimeOk && (
                <div
                  className="flex items-center gap-1 text-xs text-emerald-400/80"
                  title="Atualizações em tempo real ativas"
                  data-testid="status-realtime"
                >
                  <Radio className="h-3 w-3" />
                  <span className="hidden sm:inline">Ao vivo</span>
                </div>
              )}
              <button
                onClick={() => { fetchBalances(true); fetchTransactions(); }}
                disabled={isRefreshing || isFetching}
                className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
                title="Atualizar"
                data-testid="button-refresh"
              >
                <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
              </button>
            </div>
          </CardContent>
        </Card>

        {lastUpdated && !isFetching && (
          <p className="text-xs text-muted-foreground/60 text-center -mt-3">
            Atualizado às {formatTime(lastUpdated)}
          </p>
        )}

        {/* Pix Simulator */}
        <PixSimulator
          userId={userId}
          isPremium={isPremium}
          onRequestPremium={() => setShowPremiumModal(true)}
        />

        {/* 3 Boxes */}
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Suas Caixas
          </p>
          {boxes.map((box) => {
            const pct = box.goal > 0 ? Math.min((box.accumulated / box.goal) * 100, 100) : 0;
            return (
              <Card key={box.name} className="bg-card border-border">
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-foreground">
                      <span className="text-primary">{box.icon}</span>
                      <span className="font-semibold text-sm">{box.name}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {isFetching ? "..." : `${pct.toFixed(0)}%`}
                    </span>
                  </div>
                  <Progress value={isFetching ? 0 : pct} className="h-2 bg-muted" />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span className={isFetching ? "animate-pulse" : ""}>
                      {isFetching ? "R$ —" : formatCurrency(box.accumulated)}
                    </span>
                    <span>Meta: {formatCurrency(box.goal)}</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Activity feed — last 5 transactions */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Últimas 5 Atividades
            </p>
            {realtimeOk && (
              <span className="text-xs text-emerald-400/70 flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 inline-block animate-pulse" />
                Tempo real
              </span>
            )}
          </div>

          {transactions.length === 0 ? (
            <div className="rounded-xl bg-card border border-border p-6 text-center space-y-2">
              <div className="mx-auto h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                <ArrowDownLeft className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-foreground">Aguardando primeiro Pix</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Use o simulador acima para registrar sua primeira entrada.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {transactions.slice(0, 5).map((tx) => {
                const meta = CATEGORY_META[tx.category] ?? {
                  label: tx.category,
                  icon: <ArrowDownLeft className="h-4 w-4" />,
                };
                return (
                  <div
                    key={tx.id}
                    className="flex items-center justify-between rounded-xl bg-card border border-border p-3 gap-3"
                    data-testid={`tx-item-${tx.id}`}
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

      <LgpdFooter />

      {/* Premium Modal */}
      <PremiumModal
        open={showPremiumModal}
        userId={userId}
        onActivated={() => {
          setIsPremium(true);
          setShowPremiumModal(false);
        }}
        onClose={() => setShowPremiumModal(false)}
      />
    </div>
  );
};

export default Index;
