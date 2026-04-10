import { useState, useCallback, useEffect, useRef } from "react";
import { Wallet, ShieldCheck, Receipt } from "lucide-react";
import { toast } from "sonner";
import { useGoals } from "@/contexts/GoalsContext";
import { getSupabaseClient } from "@/lib/supabase";

const formatCurrency = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const CATEGORY_LABEL: Record<string, string> = {
  salario: "Salário",
  contas:  "Contas",
  reserva: "Emergência",
};

export interface BoxState {
  key: string;
  name: string;
  accumulated: number;
  goal: number;
  icon: React.ReactNode;
}

export interface TxItem {
  id: string;
  amount: number;
  category: string;
  description: string | null;
  created_at: string;
}

const buildBoxes = (
  salary: number, bills: number, emergency: number,
  salaryGoal: number, billsGoal: number, emergencyGoal: number,
): BoxState[] => [
  { key: "salary",    name: "Salário",    accumulated: salary,    goal: salaryGoal,    icon: <Wallet className="h-5 w-5" /> },
  { key: "bills",     name: "Contas",     accumulated: bills,     goal: billsGoal,     icon: <Receipt className="h-5 w-5" /> },
  { key: "emergency", name: "Emergência", accumulated: emergency, goal: emergencyGoal, icon: <ShieldCheck className="h-5 w-5" /> },
];

export function useUserStats() {
  const { userId, goals, setIsPremium } = useGoals();

  const salaryGoal    = goals?.salary    ?? 3000;
  const billsGoal     = goals?.bills     ?? 1500;
  const emergencyGoal = goals?.emergency ?? 10000;

  const [boxes, setBoxes]             = useState<BoxState[]>(buildBoxes(0, 0, 0, salaryGoal, billsGoal, emergencyGoal));
  const [transactions, setTransactions] = useState<TxItem[]>([]);
  const [isFetching, setIsFetching]   = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [realtimeOk, setRealtimeOk]   = useState(false);
  const channelRef = useRef<ReturnType<Awaited<ReturnType<typeof getSupabaseClient>>["channel"]> | null>(null);

  const fetchBalances = useCallback(async (silent = false) => {
    if (!userId) return;
    if (silent) setIsRefreshing(true);

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
      if (!silent) {
        const msg = err instanceof Error ? err.message : "Não foi possível carregar os saldos.";
        toast.error(msg);
      }
    } finally {
      if (silent) setIsRefreshing(false);
    }
  }, [userId, salaryGoal, billsGoal, emergencyGoal]);

  const fetchTransactions = useCallback(async (limit = 5) => {
    if (!userId) return;
    try {
      const res = await fetch(`/api/transactions?user_id=${encodeURIComponent(userId)}&limit=${limit}`);
      if (!res.ok) return;
      const data = await res.json();
      setTransactions(data.transactions || []);
    } catch {
      // silent — feed is non-critical
    }
  }, [userId]);

  // ── Initial parallel load (balances + transactions + premium status) ─────
  useEffect(() => {
    if (!userId) return;
    setIsFetching(true);

    const params = new URLSearchParams({
      user_id:        userId,
      salary_goal:    String(salaryGoal),
      bills_goal:     String(billsGoal),
      emergency_goal: String(emergencyGoal),
    });

    Promise.allSettled([
      fetch(`/api/saldos?${params}`),
      fetch(`/api/transactions?user_id=${encodeURIComponent(userId)}&limit=5`),
      fetch(`/api/usuario/${encodeURIComponent(userId)}`),
    ]).then(async ([balRes, txRes, statRes]) => {
      if (balRes.status === "fulfilled" && balRes.value.ok) {
        const d = await balRes.value.json().catch(() => null);
        if (d) {
          setBoxes(buildBoxes(d.salary ?? 0, d.bills ?? 0, d.emergency ?? 0, d.salary_goal ?? salaryGoal, d.bills_goal ?? billsGoal, d.emergency_goal ?? emergencyGoal));
          setLastUpdated(new Date());
        }
      }
      if (txRes.status === "fulfilled" && txRes.value.ok) {
        const d = await txRes.value.json().catch(() => null);
        if (d) setTransactions(d.transactions || []);
      }
      if (statRes.status === "fulfilled" && statRes.value.ok) {
        const d = await statRes.value.json().catch(() => null);
        if (d) setIsPremium(!!d.is_premium);
      }
    }).finally(() => setIsFetching(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // ── Supabase Realtime ────────────────────────────────────────────────────
  useEffect(() => {
    if (!userId) return;
    let active = true;

    getSupabaseClient().then((sb) => {
      if (!sb || !active) return;

      const channel = sb
        .channel(`lupe-stats-${userId}`)
        .on("postgres_changes", {
          event: "INSERT", schema: "public", table: "transactions",
          filter: `user_id=eq.${userId}`,
        }, (payload) => {
          const row = payload.new as TxItem;
          setTransactions((prev) => [row, ...prev].slice(0, 5));
          fetchBalances(true);
          toast.success(
            `+${formatCurrency(row.amount)} → ${CATEGORY_LABEL[row.category] ?? row.category}`,
            { description: row.description ?? "Pix processado" },
          );
        })
        .on("postgres_changes", {
          event: "UPDATE", schema: "public", table: "user_balances",
          filter: `user_id=eq.${userId}`,
        }, (payload) => {
          const d = payload.new as Record<string, number>;
          setBoxes(buildBoxes(
            d.salary, d.bills, d.emergency,
            d.salary_goal ?? salaryGoal,
            d.bills_goal  ?? billsGoal,
            d.emergency_goal ?? emergencyGoal,
          ));
          setLastUpdated(new Date());
        })
        .subscribe((status) => setRealtimeOk(status === "SUBSCRIBED"));

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

  return {
    boxes, transactions,
    isFetching, isRefreshing, lastUpdated, realtimeOk,
    fetchBalances, fetchTransactions,
    setTransactions,
  };
}
