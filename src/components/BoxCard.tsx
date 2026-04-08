import { Card, CardContent } from "@/components/ui/card";
import type { BoxState } from "@/hooks/useUserStats";

interface BoxCardProps extends BoxState {
  isLoading?: boolean;
  isSimulated?: boolean;
}

const formatCurrency = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const CIRCUMFERENCE = 2 * Math.PI * 30;

export function BoxCard({ name, accumulated, goal, icon, isLoading = false, isSimulated = false }: BoxCardProps) {
  const pct       = goal > 0 ? Math.min((accumulated / goal) * 100, 100) : 0;
  const remaining = Math.max(goal - accumulated, 0);
  const offset    = isLoading ? CIRCUMFERENCE : CIRCUMFERENCE * (1 - pct / 100);
  const full      = pct >= 100;

  return (
    <Card className={`bg-card border-border transition-colors ${isSimulated ? "border-amber-400/30" : ""}`}>
      <CardContent className="p-4 flex items-center gap-4">

        {/* SVG Donut ring */}
        <div className="relative shrink-0 w-[72px] h-[72px]">
          <svg
            width="72" height="72" viewBox="0 0 72 72"
            className="-rotate-90"
            aria-hidden="true"
          >
            {/* Track */}
            <circle
              cx="36" cy="36" r="30"
              fill="none" strokeWidth="7"
              style={{ stroke: "hsl(var(--muted))" }}
            />
            {/* Progress */}
            <circle
              cx="36" cy="36" r="30"
              fill="none" strokeWidth="7"
              strokeLinecap="round"
              style={{
                stroke: full
                  ? "hsl(142 71% 45%)"
                  : isSimulated
                  ? "hsl(38 92% 50%)"
                  : "hsl(var(--primary))",
                strokeDasharray: CIRCUMFERENCE,
                strokeDashoffset: offset,
                transition: "stroke-dashoffset 0.7s ease, stroke 0.4s ease",
              }}
            />
          </svg>
          {/* Centre label */}
          <div className="absolute inset-0 flex items-center justify-center">
            <span className={`text-[11px] font-extrabold ${full ? "text-emerald-400" : isSimulated ? "text-amber-400" : "text-foreground"}`}>
              {isLoading ? "…" : `${Math.round(pct)}%`}
            </span>
          </div>
        </div>

        {/* Text block */}
        <div className="flex-1 min-w-0 space-y-0.5">
          <div className="flex items-center gap-1.5">
            <span className={`${full ? "text-emerald-400" : isSimulated ? "text-amber-400" : "text-primary"}`}>{icon}</span>
            <span className="text-sm font-semibold text-foreground">{name}</span>
            {isSimulated && (
              <span className="text-[9px] font-bold text-amber-400/80 bg-amber-400/10 border border-amber-400/20 px-1.5 py-0.5 rounded-full uppercase tracking-wider">
                simulado
              </span>
            )}
          </div>

          <p className={`text-xl font-extrabold tracking-tight ${isLoading ? "text-muted-foreground animate-pulse" : isSimulated ? "text-amber-400" : "text-foreground"}`}>
            {isLoading ? "R$ —" : formatCurrency(accumulated)}
          </p>

          <p className="text-[11px] text-muted-foreground">
            Meta: {formatCurrency(goal)}
          </p>

          {!isLoading && (
            <p className={`text-[11px] font-semibold ${full ? "text-emerald-400" : isSimulated ? "text-amber-400/80" : "text-primary/80"}`}>
              {full ? "✓ Meta atingida!" : `Faltam ${formatCurrency(remaining)}`}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
