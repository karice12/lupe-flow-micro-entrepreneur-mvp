import { useState } from "react";
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

const formatCurrency = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const Index = () => {
  const navigate = useNavigate();
  const [boxes, setBoxes] = useState<BoxState[]>([
    { name: "Salário", accumulated: 0, goal: 3000, icon: <Wallet className="h-5 w-5" /> },
    { name: "Contas", accumulated: 0, goal: 1500, icon: <Receipt className="h-5 w-5" /> },
    { name: "Emergência", accumulated: 0, goal: 10000, icon: <ShieldCheck className="h-5 w-5" /> },
  ]);
  const [inputValue, setInputValue] = useState("");
  const [transactions, setTransactions] = useState<Transaction[]>(INITIAL_TRANSACTIONS);

  const totalBalance = boxes.reduce((s, b) => s + b.accumulated, 0);

  const handleSimulate = () => {
    const value = parseFloat(inputValue.replace(",", "."));
    if (!value || value <= 0) {
      toast.error("Insira um valor válido.");
      return;
    }

    setBoxes((prev) => {
      const updated = [...prev.map((b) => ({ ...b }))];
      const salario = updated[0];
      const contas = updated[1];
      const emergencia = updated[2];

      const salarioFull = salario.accumulated >= salario.goal;
      const contasFull = contas.accumulated >= contas.goal;

      if (salarioFull && contasFull) {
        emergencia.accumulated += value;
      } else {
        const splits = [
          { box: salario, pct: 0.3 },
          { box: contas, pct: 0.5 },
          { box: emergencia, pct: 0.2 },
        ];
        splits.forEach(({ box, pct }) => {
          box.accumulated += value * pct;
        });
      }

      return updated;
    });

    setTransactions((prev) => [
      {
        id: Date.now(),
        description: `Pix Simulado`,
        amount: value,
        date: new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
        type: "in",
      },
      ...prev,
    ]);

    setInputValue("");
    toast.success(`Simulação de ${formatCurrency(value)} aplicada!`);
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
              <p className="text-lg font-bold text-foreground">{formatCurrency(totalBalance)}</p>
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
                  onKeyDown={(e) => e.key === "Enter" && handleSimulate()}
                  className="pl-9 bg-background border-border"
                />
              </div>
              <Button variant="cta" size="lg" onClick={handleSimulate}>
                Simular Pix
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
                      {pct.toFixed(0)}%
                    </span>
                  </div>
                  <Progress value={pct} className="h-2 bg-muted" />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{formatCurrency(box.accumulated)}</span>
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
