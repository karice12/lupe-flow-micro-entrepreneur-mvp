import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useGoals } from "@/contexts/GoalsContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Zap, Wallet, Receipt, ShieldCheck, ArrowRight, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";

const STEPS = [
  {
    key: "salary" as const,
    label: "Meta de Salário (Pró-labore)",
    question: "Quanto você quer tirar para suas contas pessoais por mês?",
    placeholder: "3.000",
    icon: <Wallet className="h-8 w-8" />,
  },
  {
    key: "bills" as const,
    label: "Contas da Empresa",
    question: "Qual o custo fixo mensal do seu negócio (aluguel, MEI, ferramentas)?",
    placeholder: "1.500",
    icon: <Receipt className="h-8 w-8" />,
  },
  {
    key: "emergency" as const,
    label: "Reserva de Emergência",
    question: "Qual o valor total que você deseja acumular na sua reserva?",
    placeholder: "10.000",
    icon: <ShieldCheck className="h-8 w-8" />,
  },
];

const Onboarding = () => {
  const [step, setStep] = useState(0);
  const [values, setValues] = useState({ salary: "", bills: "", emergency: "" });
  const [isSaving, setIsSaving] = useState(false);
  const navigate = useNavigate();
  const { userId, setGoals } = useGoals();

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const progressPct = ((step + 1) / STEPS.length) * 100;

  const parseValue = (v: string) => parseFloat(v.replace(/\./g, "").replace(",", ".")) || 0;

  const handleNext = async () => {
    if (!values[current.key] || parseValue(values[current.key]) <= 0) return;

    if (!isLast) {
      setStep((s) => s + 1);
      return;
    }

    const salaryGoal = parseValue(values.salary);
    const billsGoal = parseValue(values.bills);
    const emergencyGoal = parseValue(values.emergency);

    setIsSaving(true);
    try {
      const res = await fetch(`/api/usuario/${encodeURIComponent(userId)}/metas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          salary_goal: salaryGoal,
          bills_goal: billsGoal,
          emergency_goal: emergencyGoal,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Erro ao salvar metas.");
      }

      setGoals({ salary: salaryGoal, bills: billsGoal, emergency: emergencyGoal });
      toast.success("Metas salvas! Abrindo seu caixa...");
      navigate("/dashboard");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro ao conectar com o servidor.";
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-md space-y-8">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2">
          <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center">
            <Zap className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="text-2xl font-extrabold tracking-tight text-foreground">Lupe Flow</span>
        </div>

        {/* Progress */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Passo {step + 1} de {STEPS.length}</span>
            <span>{progressPct.toFixed(0)}%</span>
          </div>
          <Progress value={progressPct} className="h-1.5 bg-muted" />
        </div>

        {/* Step indicators */}
        <div className="flex justify-center gap-3">
          {STEPS.map((s, i) => (
            <div
              key={s.key}
              className={`h-2.5 w-2.5 rounded-full transition-colors ${
                i <= step ? "bg-primary" : "bg-muted"
              }`}
            />
          ))}
        </div>

        {/* Question card */}
        <div className="space-y-6 text-center">
          <div className="flex justify-center text-primary">{current.icon}</div>
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">
              {current.label}
            </p>
            <p className="text-foreground text-lg font-medium leading-snug">
              {current.question}
            </p>
          </div>

          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">
              R$
            </span>
            <Input
              type="text"
              inputMode="decimal"
              placeholder={current.placeholder}
              value={values[current.key]}
              onChange={(e) =>
                setValues((v) => ({ ...v, [current.key]: e.target.value }))
              }
              onKeyDown={(e) => e.key === "Enter" && !isSaving && handleNext()}
              className="h-14 pl-11 text-xl font-bold rounded-xl bg-card border-border text-center"
              disabled={isSaving}
            />
          </div>

          <Button
            variant="cta"
            size="lg"
            onClick={handleNext}
            disabled={!values[current.key] || parseValue(values[current.key]) <= 0 || isSaving}
            className="w-full h-12 rounded-xl text-base gap-2"
            data-testid="button-next"
          >
            {isSaving ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Salvando...
              </>
            ) : isLast ? (
              <>
                <Check className="h-5 w-5" />
                Finalizar e Abrir meu Caixa
              </>
            ) : (
              <>
                Próximo
                <ArrowRight className="h-5 w-5" />
              </>
            )}
          </Button>

          {step > 0 && !isSaving && (
            <button
              onClick={() => setStep((s) => s - 1)}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              ← Voltar
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default Onboarding;
