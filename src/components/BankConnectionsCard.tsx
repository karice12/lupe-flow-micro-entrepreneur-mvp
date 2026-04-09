import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Building2, Plus, Trash2, Loader2, Lock, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { getAccessToken } from "@/lib/supabase";

/** A single bank connection record returned by the API. */
interface BankConnection {
  id: string;
  user_id: string;
  bank_name: string;
  status: "active" | "inactive";
  provider_id?: string | null;
  activated_at: string;
  deactivated_at?: string | null;
}

interface BankConnectionsCardProps {
  /** Authenticated user's UUID */
  userId: string;
  /** Whether the user has an active premium subscription */
  isPremium: boolean;
  /** Callback to open the premium upgrade modal */
  onRequestPremium: () => void;
}

const EXTRA_BANK_COST = 7.99;

const formatDate = (iso: string) => {
  try {
    return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return iso;
  }
};

/** Fetches bank connections from the backend for the given user. */
async function fetchConnections(userId: string): Promise<{ connections: BankConnection[]; billable_units: number }> {
  const token = await getAccessToken();
  if (!token) throw new Error("Sessão expirada.");
  const res = await fetch(`/api/usuario/${encodeURIComponent(userId)}/banks`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Erro ao carregar conexões.");
  }
  return res.json();
}

/** Sends a DELETE request to soft-deactivate a bank connection. */
async function deactivateConnection(userId: string, connectionId: string): Promise<void> {
  const token = await getAccessToken();
  if (!token) throw new Error("Sessão expirada.");
  const res = await fetch(
    `/api/usuario/${encodeURIComponent(userId)}/banks/${encodeURIComponent(connectionId)}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Erro ao remover conexão.");
  }
}

export function BankConnectionsCard({ userId, isPremium, onRequestPremium }: BankConnectionsCardProps) {
  const [connections, setConnections] = useState<BankConnection[]>([]);
  const [billableUnits, setBillableUnits] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  /** Load connections from the API — only called for premium users. */
  const loadConnections = useCallback(async () => {
    if (!isPremium || !userId) return;
    setIsLoading(true);
    try {
      const data = await fetchConnections(userId);
      setConnections(data.connections);
      setBillableUnits(data.billable_units);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao carregar conexões.";
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  }, [isPremium, userId]);

  useEffect(() => {
    loadConnections();
  }, [loadConnections]);

  /** Soft-remove a bank connection by connection ID. */
  const handleRemove = async (connectionId: string, bankName: string) => {
    setRemovingId(connectionId);
    try {
      await deactivateConnection(userId, connectionId);
      toast.success(`Conexão com ${bankName} desativada.`);
      await loadConnections();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao remover conexão.";
      toast.error(msg);
    } finally {
      setRemovingId(null);
    }
  };

  const activeConnections = connections.filter((c) => c.status === "active");
  const inactiveConnections = connections.filter((c) => c.status === "inactive");

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Conexões Bancárias
        </p>
        {isPremium && billableUnits > 0 && (
          <span className="text-xs text-amber-400 font-medium">
            +R$ {(billableUnits * EXTRA_BANK_COST).toFixed(2).replace(".", ",")}/mês
          </span>
        )}
      </div>

      <Card className="border-border bg-card">
        <CardContent className="p-4 space-y-4">

          {/* ── Free user — show simulator upsell only ─────────────────── */}
          {!isPremium && (
            <div className="flex flex-col items-center gap-3 py-2 text-center">
              <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                <Lock className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">Modo Simulador</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  O simulador de PIX já está disponível gratuitamente.<br />
                  Ative o Premium para conectar bancos reais.
                </p>
              </div>
              <Button
                variant="cta"
                size="sm"
                className="h-8 px-4 rounded-lg text-xs"
                onClick={onRequestPremium}
              >
                Ativar Premium — R$ 29,90/mês
              </Button>
            </div>
          )}

          {/* ── Premium user — bank list ───────────────────────────────── */}
          {isPremium && (
            <div className="space-y-3">

              {/* Loading skeleton */}
              {isLoading && (
                <div className="flex items-center justify-center py-4 gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Carregando conexões...</span>
                </div>
              )}

              {/* Empty state */}
              {!isLoading && activeConnections.length === 0 && (
                <div className="flex flex-col items-center gap-2 py-2 text-center">
                  <Building2 className="h-8 w-8 text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground">Nenhum banco conectado ainda.</p>
                </div>
              )}

              {/* Active connections */}
              {!isLoading && activeConnections.map((conn, idx) => (
                <div
                  key={conn.id}
                  className="flex items-center justify-between rounded-lg border border-border bg-background p-3 gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <Building2 className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{conn.bank_name}</p>
                      <div className="flex items-center gap-1.5">
                        <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0" />
                        <span className="text-xs text-emerald-400">Ativo desde {formatDate(conn.activated_at)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {/* Extra cost badge — first bank is included in base plan */}
                    {idx > 0 && (
                      <span className="text-[10px] font-bold text-amber-400 bg-amber-400/10 border border-amber-400/20 px-1.5 py-0.5 rounded-full">
                        +R$ 7,99
                      </span>
                    )}
                    {idx === 0 && (
                      <span className="text-[10px] font-bold text-primary bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded-full">
                        incluso
                      </span>
                    )}
                    <button
                      onClick={() => handleRemove(conn.id, conn.bank_name)}
                      disabled={removingId === conn.id}
                      className="text-muted-foreground hover:text-destructive transition-colors disabled:opacity-40"
                      title={`Remover ${conn.bank_name}`}
                      aria-label={`Remover conexão com ${conn.bank_name}`}
                    >
                      {removingId === conn.id
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : <Trash2 className="h-4 w-4" />
                      }
                    </button>
                  </div>
                </div>
              ))}

              {/* Inactive connections (collapsed summary) */}
              {!isLoading && inactiveConnections.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                    Desativados este mês (contam na cobrança)
                  </p>
                  {inactiveConnections.map((conn) => (
                    <div
                      key={conn.id}
                      className="flex items-center gap-3 rounded-lg border border-border/50 bg-muted/30 p-2.5"
                    >
                      <XCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="text-xs text-muted-foreground truncate flex-1">{conn.bank_name}</span>
                      {conn.deactivated_at && (
                        <span className="text-[10px] text-muted-foreground/60 shrink-0">
                          até {formatDate(conn.deactivated_at)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Add bank — placeholder for future Pluggy integration */}
              <Button
                variant="outline"
                size="sm"
                className="w-full h-9 rounded-lg text-xs gap-2 border-dashed"
                onClick={() => toast.info("Integração com Open Finance (Pluggy) em breve!")}
              >
                <Plus className="h-4 w-4" />
                Conectar novo banco
              </Button>

              {/* Billing info footer */}
              <p className="text-[10px] text-muted-foreground/60 text-center leading-relaxed">
                1 banco incluso no plano · R$ 7,99/mês por banco adicional<br />
                Bancos desativados no mês corrente são cobrados proporcionalmente.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
