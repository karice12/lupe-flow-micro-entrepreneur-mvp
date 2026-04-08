import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Wallet, ShieldCheck, Receipt,
  ArrowDownLeft, ArrowUpRight, Zap, LogOut, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { useGoals } from "@/contexts/GoalsContext";
import { LgpdFooter } from "@/components/LgpdFooter";

interface BoxState {
  name: string;
  accumulated: number;
  goal: number;
  icon: React.ReactNode;
}

interface Transaction {
  id: number;
  description: string;
  amount: number;
  date: string;
  type: "in" | "out";
}

const formatCurrency = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const formatTime = (d: Date) =>
  d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

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
  const { userId, goals } = useGoals();

  const salaryGoal    = goals?.salary    ?? 3000;
  const billsGoal     = goals?.bills     ?? 1500;
  const emergencyGoal = goals?.emergency ?? 10000;

  const [boxes, setBoxes]               = useState<BoxState[]>(buildBoxes(0, 0, 0, salaryGoal, billsGoal, emergencyGoal));
  const [isFetching, setIsFetching]     = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated]   = useState<Date | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  const totalBalance = boxes.reduce((s, b) => s + b.accumulated, 0);

  const fetchBalances = async (silent = false) => {
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
  };

  useEffect(() => {
    fetchBalances();
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
              onClick={() => navigate("/")}
              className="text-muted-foreground hover:text-foreground transition-colors"
              title="Sair"
              data-testid="button-logout"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </header>

        {/* Connection status banner */}
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
            <button
              onClick={() => fetchBalances(true)}
              disabled={isRefreshing || isFetching}
              className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
              title="Atualizar"
              data-testid="button-refresh"
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
            </button>
          </CardContent>
        </Card>

        {/* Last updated */}
        {lastUpdated && !isFetching && (
          <p className="text-xs text-muted-foreground/60 text-center -mt-3">
            Atualizado às {formatTime(lastUpdated)}
          </p>
        )}

        {/* Boxes */}
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

        {/* Transactions */}
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Últimas Transações
          </p>
          {transactions.length === 0 ? (
            <div className="rounded-lg bg-card border border-border p-6 text-center space-y-1">
              <p className="text-sm font-medium text-foreground">Aguardando movimentações</p>
              <p className="text-xs text-muted-foreground">
                Quando um Pix for recebido e processado pelo backend, ele aparecerá aqui automaticamente.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {transactions.slice(0, 8).map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center justify-between rounded-lg bg-card border border-border p-3"
                >
                  <div className="flex items-center gap-3">
                    <div className={`h-8 w-8 rounded-full flex items-center justify-center ${
                      tx.type === "in" ? "bg-primary/15 text-primary" : "bg-destructive/15 text-destructive"
                    }`}>
                      {tx.type === "in"
                        ? <ArrowDownLeft className="h-4 w-4" />
                        : <ArrowUpRight className="h-4 w-4" />
                      }
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{tx.description}</p>
                      <p className="text-xs text-muted-foreground">{tx.date}</p>
                    </div>
                  </div>
                  <span className={`text-sm font-semibold ${tx.type === "in" ? "text-primary" : "text-destructive"}`}>
                    {tx.type === "in" ? "+" : ""}{formatCurrency(tx.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

      <LgpdFooter />
    </div>
  );
};

export default Index;
