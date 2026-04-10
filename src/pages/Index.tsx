import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Wallet, ShieldCheck, Receipt,
  ArrowDownLeft, Zap, LogOut, RefreshCw, Radio, Star, ChevronRight,
  FileDown, Loader2,
} from "lucide-react";
import { getAccessToken } from "@/lib/supabase";
import { toast } from "sonner";
import { useGoals } from "@/contexts/GoalsContext";
import { LgpdFooter } from "@/components/LgpdFooter";
import { PremiumModal } from "@/components/PremiumModal";
import { PixSimulator } from "@/components/PixSimulator";
import { BoxCard } from "@/components/BoxCard";
import { BankConnectionsCard } from "@/components/BankConnectionsCard";
import { useUserStats } from "@/hooks/useUserStats";

const formatCurrency = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const formatTime = (d: Date) =>
  d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

const formatTxDate = (iso: string) => {
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit", month: "2-digit",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
};

const CATEGORY_META: Record<string, { label: string; icon: React.ReactNode }> = {
  salario: { label: "Salário",    icon: <Wallet className="h-4 w-4" /> },
  contas:  { label: "Contas",     icon: <Receipt className="h-4 w-4" /> },
  reserva: { label: "Emergência", icon: <ShieldCheck className="h-4 w-4" /> },
};

const Index = () => {
  const navigate = useNavigate();
  const { userId, isPremium, isAuthReady, setIsPremium, signOut } = useGoals();

  const {
    boxes, transactions,
    isFetching, isRefreshing, lastUpdated, realtimeOk,
    fetchBalances, fetchTransactions,
  } = useUserStats();

  const [showPremiumModal, setShowPremiumModal] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);

  const totalBalance = boxes.reduce((s, b) => s + b.accumulated, 0);

  const prevMonthLabel = (() => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - 1);
    return d.toLocaleString("pt-BR", { month: "long", year: "numeric" });
  })();

  const handleDownloadRelatorio = async () => {
    if (!isPremium) { setShowPremiumModal(true); return; }
    setIsDownloadingPdf(true);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("Sessão expirada.");
      const res = await fetch(`/api/usuario/${encodeURIComponent(userId)}/relatorio/mensal`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Erro ao gerar relatório.");
      }
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `lupeflow-relatorio-${new Date().toISOString().slice(0, 7)}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Relatório baixado com sucesso!");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao baixar relatório.";
      toast.error(msg);
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  // ── Auth guard ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (isAuthReady && !userId) navigate("/");
  }, [isAuthReady, userId, navigate]);

  const handleVerTudo = () => {
    if (!isPremium) {
      setShowPremiumModal(true);
    } else {
      navigate("/transactions");
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="flex-1 max-w-md mx-auto w-full px-4 py-6 space-y-5">

        {/* ── Header ─────────────────────────────────────────────────── */}
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

        {/* ── Premium banner ──────────────────────────────────────────── */}
        {!isPremium && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="p-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <Star className="h-4 w-4 text-primary shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">Ative o Lupe Flow Premium</p>
                  <p className="text-xs text-muted-foreground truncate">Lançamentos reais, histórico e realtime por R$ 29,90/mês</p>
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

        {/* ── Connection + realtime status ────────────────────────────── */}
        <Card className="border-emerald-500/20 bg-emerald-500/5">
          <CardContent className="p-3 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
              </span>
              <span className="text-sm font-medium text-emerald-400">Conectado à sua conta</span>
            </div>
            <div className="flex items-center gap-3">
              {realtimeOk && (
                <div className="flex items-center gap-1 text-xs text-emerald-400/80" data-testid="status-realtime">
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
          <p className="text-xs text-muted-foreground/60 text-center -mt-2">
            Atualizado às {formatTime(lastUpdated)}
          </p>
        )}

        {/* ── PIX Entry / Paywall ─────────────────────────────────────── */}
        <PixSimulator
          userId={userId}
          isPremium={isPremium}
          onRequestPremium={() => setShowPremiumModal(true)}
        />

        {/* ── Bank Connections ────────────────────────────────────────── */}
        <BankConnectionsCard
          userId={userId}
          isPremium={isPremium}
          onRequestPremium={() => setShowPremiumModal(true)}
        />

        {/* ── 3 Boxes ─────────────────────────────────────────────────── */}
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Suas Caixas
          </p>
          {boxes.map(({ key, ...boxProps }) => (
            <BoxCard key={key} {...boxProps} isLoading={isFetching} />
          ))}
        </div>

        {/* ── Activity feed ───────────────────────────────────────────── */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Atividades Recentes
              </p>
              {realtimeOk && (
                <span className="flex items-center gap-1 text-xs text-emerald-400/70">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 inline-block animate-pulse" />
                  Ao vivo
                </span>
              )}
            </div>
            <button
              onClick={handleVerTudo}
              className="flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary/80 transition-colors"
              data-testid="button-ver-tudo"
            >
              Ver Tudo
              <ChevronRight className="h-3 w-3" />
            </button>
          </div>

          {transactions.length === 0 ? (
            <div className="rounded-xl bg-card border border-border p-6 text-center space-y-2">
              <div className="mx-auto h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                <ArrowDownLeft className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-foreground">Aguardando primeiro Pix</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Conecte seu banco ou registre uma entrada para ver a distribuição.
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

        {/* ── Baixar Relatório PDF ─────────────────────────────────────── */}
        <button
          onClick={handleDownloadRelatorio}
          disabled={isDownloadingPdf}
          className="w-full flex items-center justify-between rounded-xl border border-primary/20 bg-primary/5 hover:bg-primary/10 hover:border-primary/40 transition-colors px-4 py-3 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-9 w-9 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
              {isDownloadingPdf
                ? <Loader2 className="h-4 w-4 text-primary animate-spin" />
                : <FileDown className="h-4 w-4 text-primary" />
              }
            </div>
            <div className="text-left min-w-0">
              <p className="text-sm font-semibold text-foreground">
                {isDownloadingPdf ? "Gerando PDF..." : `Baixar Relatório — ${prevMonthLabel}`}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {isPremium
                  ? "Resumo mensal com suas 3 caixas e transações"
                  : "Exclusivo Premium — clique para assinar"}
              </p>
            </div>
          </div>
          {!isDownloadingPdf && (
            <ChevronRight className="h-4 w-4 text-primary shrink-0" />
          )}
        </button>

      </div>

      <LgpdFooter />

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
