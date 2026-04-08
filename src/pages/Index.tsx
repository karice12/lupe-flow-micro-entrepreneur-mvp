import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Wallet, ShieldCheck, Receipt, ArrowDownLeft, ArrowUpRight, Zap, LogOut } from "lucide-react";
import { toast } from "sonner";
import { useGoals } from "@/contexts/GoalsContext";

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

const INITIAL_TRANSACTIONS: Transaction[] = [
  { id: 1, description: "Venda Maquininha", amount: 150, date: "08/04", type: "in" },
  { id: 2, description: "Pix Recebido - Cliente", amount: 320, date: "07/04", type: "in" },
  { id: 3, description: "Pagamento Fornecedor", amount: -200, date: "06/04", type: "out" },
];

const USER_ID = "usuario_teste";

const formatCurrency = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const makeBoxes = (
  salary: number,
  bills: number,
  emergency: number,
  salaryGoal: number,
  billsGoal: number,
  emergencyGoal: number
): BoxState[] => [
  { name: "Salário", accumulated: salary, goal: salaryGoal, icon: <Wallet className="h-5 w-5" /> },
  { name: "Contas", accumulated: bills, goal: billsGoal, icon: <Receipt className="h-5 w-5" /> },
  { name: "Emergência", accumulated: emergency, goal: emergencyGoal, icon: <ShieldCheck className="h-5 w-5" /> },
];

const Index = () => {
  const navigate = useNavigate();
  const { goals } = useGoals();

  const salaryGoal = goals?.salary ?? 3000;
  const billsGoal = goals?.bills ?? 1500;
  const emergencyGoal = goals?.emergency ?? 10000;

  const [boxes, setBoxes] = useState<BoxState[]>(
    makeBoxes(0, 0, 0, salaryGoal, billsGoal, emergencyGoal)
  );
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);
  const [transactions, setTransactions] = useState<Transaction[]>(INITIAL_TRANSACTIONS);

  const totalBalance = boxes.reduce((s, b) => s + b.accumulated, 0);

  // Load balances from backend on mount
  useEffect(() => {
    const params = new URLSearchParams({
      user_id: USER_ID,
      salary_goal: String(salaryGoal),
      bills_goal: String(billsGoal),
      emergency_goal: String(emergencyGoal),
    });

    fetch(`/api/saldos?${params}`)
      .then((res) => {
        if (!res.ok) throw new Error("Falha ao carregar saldos.");
        return res.json();
      })
      .then((data) => {
        setBoxes(makeBoxes(
          data.salary,
          data.bills,
          data.emergency,
          data.salary_goal,
          data.bills_goal,
          data.emergency_goal,
        ));
      })
      .catch((err) => {
        console.error(err);
        toast.error("Não foi possível carregar os saldos do banco.");
      })
      .finally(() => setIsFetching(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSimulate = async () => {
    const value = parseFloat(inputValue.replace(",", "."));
    if (!value || value <= 0) {
      toast.error("Insira um valor válido.");
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch("/api/dividir-pix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          valor_pix: value,
          user_id: USER_ID,
          salary_goal: salaryGoal,
          bills_goal: billsGoal,
          emergency_goal: emergencyGoal,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Erro ao processar Pix.");
      }

      const data = await res.json();

      setBoxes(makeBoxes(
        data.salary,
        data.bills,
        data.emergency,
        data.salary_goal,
        data.bills_goal,
        data.emergency_goal,
      ));

      setTransactions((prev) => [
        {
          id: Date.now(),
          description: "Pix Simulado",
          amount: value,
          date: new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
          type: "in",
        },
        ...prev,
      ]);

      setInputValue("");

      if (data.overflow > 0) {
        toast.success(
          `${formatCurrency(value)} distribuído! Transbordo de ${formatCurrency(data.overflow)} foi para Emergência.`
        );
      } else {
        toast.success(`${formatCurrency(value)} distribuído com sucesso!`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro ao conectar com o servidor.";
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-md mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
              <Zap className="h-4 w-4 text-primary-foreground" />
            </div>
            <h1 className="text-xl font-extrabold tracking-tight text-foreground">
              Lupe Flow
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Saldo disponível</p>
              <p className="text-lg font-bold text-foreground">
                {isFetching ? "..." : formatCurrency(totalBalance)}
              </p>
            </div>
            <button
              onClick={() => navigate("/")}
              className="text-muted-foreground hover:text-foreground transition-colors"
              title="Sair"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </header>

        {/* Simulator */}
        <Card className="border-primary/20 bg-surface-elevated">
          <CardContent className="p-4 space-y-3">
            <p className="text-sm font-semibold text-foreground">Simulador de entrada</p>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
                <Input
                  type="text"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !isLoading && handleSimulate()}
                  className="pl-9 bg-background border-border"
                  disabled={isLoading || isFetching}
                  data-testid="input-pix-value"
                />
              </div>
              <Button
                variant="cta"
                size="lg"
                onClick={handleSimulate}
                disabled={isLoading || isFetching}
                data-testid="button-simular-pix"
              >
                {isLoading ? "Processando..." : "Simular Pix"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Boxes */}
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Suas Caixas
          </p>
          {boxes.map((box) => {
            const pct = Math.min((box.accumulated / box.goal) * 100, 100);
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
                    <span>{isFetching ? "..." : formatCurrency(box.accumulated)}</span>
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
          <div className="space-y-2">
            {transactions.slice(0, 8).map((tx) => (
              <div
                key={tx.id}
                className="flex items-center justify-between rounded-lg bg-card border border-border p-3"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`h-8 w-8 rounded-full flex items-center justify-center ${
                      tx.type === "in" ? "bg-primary/15 text-primary" : "bg-destructive/15 text-destructive"
                    }`}
                  >
                    {tx.type === "in" ? (
                      <ArrowDownLeft className="h-4 w-4" />
                    ) : (
                      <ArrowUpRight className="h-4 w-4" />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{tx.description}</p>
                    <p className="text-xs text-muted-foreground">{tx.date}</p>
                  </div>
                </div>
                <span
                  className={`text-sm font-semibold ${
                    tx.type === "in" ? "text-primary" : "text-destructive"
                  }`}
                >
                  {tx.type === "in" ? "+" : ""}
                  {formatCurrency(tx.amount)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;
