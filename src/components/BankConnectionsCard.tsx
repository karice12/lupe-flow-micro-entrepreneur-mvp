import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Building2, Plus, Trash2, Loader2, Lock, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { getAccessToken } from "@/lib/supabase";

declare global {
  interface Window {
    PluggyConnect: new (config: {
      connectToken: string;
      onSuccess: (data: { item: { id: string; connector: { name: string } } }) => void;
      onError: (data: { message: string }) => void;
      onClose: () => void;
    }) => { init: () => void };
  }
}

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
  userId: string;
  isPremium: boolean;
  onRequestPremium: () => void;
}

const EXTRA_BANK_COST = 7.99;
const PLUGGY_SCRIPT_URL = "https://cdn.pluggy.ai/pluggy-connect/v2/index.js";

const formatDate = (iso: string) => {
  try {
    return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return iso;
  }
};

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

async function fetchPluggyToken(): Promise<string> {
  const token = await getAccessToken();
  if (!token) throw new Error("Sessão expirada.");
  const res = await fetch("/api/pluggy/token", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Erro ao obter token da Pluggy.");
  }
  const data = await res.json();
  return data.connect_token;
}

async function savePluggyConnection(userId: string, bankName: string, providerId: string): Promise<void> {
  const token = await getAccessToken();
  if (!token) throw new Error("Sessão expirada.");
  const res = await fetch(`/api/usuario/${encodeURIComponent(userId)}/banks`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ bank_name: bankName, provider_id: providerId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Erro ao salvar conexão.");
  }
}

function loadPluggyScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.PluggyConnect) { resolve(); return; }
    const existing = document.querySelector(`script[src="${PLUGGY_SCRIPT_URL}"]`);
    if (existing) { existing.addEventListener("load", () => resolve()); return; }
    const script = document.createElement("script");
    script.src = PLUGGY_SCRIPT_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Falha ao carregar o widget Pluggy."));
    document.head.appendChild(script);
  });
}

export function BankConnectionsCard({ userId, isPremium, onRequestPremium }: BankConnectionsCardProps) {
  const [connections, setConnections] = useState<BankConnection[]>([]);
  const [billableUnits, setBillableUnits] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const widgetRef = useRef<{ init: () => void } | null>(null);

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

  const handleConnectBank = async () => {
    setIsConnecting(true);
    try {
      await loadPluggyScript();
      const connectToken = await fetchPluggyToken();

      widgetRef.current = new window.PluggyConnect({
        connectToken,
        onSuccess: async ({ item }) => {
          const bankName = item.connector?.name || "Banco conectado";
          try {
            await savePluggyConnection(userId, bankName, item.id);
            toast.success(`${bankName} conectado com sucesso!`);
            await loadConnections();
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Erro ao salvar conexão.";
            toast.error(msg);
          }
        },
        onError: ({ message }) => {
          toast.error(`Erro na conexão: ${message}`);
        },
        onClose: () => {
          setIsConnecting(false);
        },
      });

      widgetRef.current.init();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao abrir o widget.";
      toast.error(msg);
      setIsConnecting(false);
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

          {/* ── Free user — simulator upsell ───────────────────────────── */}
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

          {/* ── Premium user — bank list ────────────────────────────────── */}
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

              {/* Inactive connections */}
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

              {/* Connect bank button — Pluggy Widget */}
              <Button
                variant="outline"
                size="sm"
                className="w-full h-9 rounded-lg text-xs gap-2 border-dashed border-amber-400/30 hover:border-amber-400/60 hover:bg-amber-400/5 hover:text-amber-400 transition-colors"
                onClick={handleConnectBank}
                disabled={isConnecting}
              >
                {isConnecting
                  ? <><Loader2 className="h-4 w-4 animate-spin" />Abrindo widget...</>
                  : <><Plus className="h-4 w-4" />Conectar novo banco</>
                }
              </Button>

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
