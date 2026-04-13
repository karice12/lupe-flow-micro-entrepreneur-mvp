import { setDemoToken } from "@/lib/supabase";

const DEMO_ENDPOINT = "/api/demo/data";
const DEMO_FAKE_TOKEN = "demo-access-token";
const DEMO_PIX_EVENT = "demo:pix-processed";

let _originalFetch: typeof window.fetch | null = null;

interface DemoState {
  salary: number;
  bills: number;
  emergency: number;
  salary_goal: number;
  bills_goal: number;
  emergency_goal: number;
  is_premium: boolean;
  lgpd_accepted: boolean;
  transactions: DemoTx[];
}

interface DemoTx {
  id: string;
  amount: number;
  category: string;
  description: string | null;
  created_at: string;
}

let _state: DemoState = {
  salary: 3000,
  bills: 4000,
  emergency: 3000,
  salary_goal: 6000,
  bills_goal: 5000,
  emergency_goal: 10000,
  is_premium: true,
  lgpd_accepted: true,
  transactions: [
    { id: "demo-1", amount: 1500,  category: "salario", description: "Pix de cliente #1",    created_at: "2026-04-13T09:00:00Z" },
    { id: "demo-2", amount: 1000,  category: "contas",  description: "Pagamento fornecedor", created_at: "2026-04-12T15:30:00Z" },
    { id: "demo-3", amount: 400,   category: "reserva", description: "Reserva de emergência",created_at: "2026-04-11T11:00:00Z" },
    { id: "demo-4", amount: 2000,  category: "salario", description: "Pix de cliente #2",    created_at: "2026-04-10T08:45:00Z" },
    { id: "demo-5", amount: 600,   category: "contas",  description: "Despesa operacional",  created_at: "2026-04-09T14:20:00Z" },
  ],
};

function resetState() {
  _state = {
    salary: 3000,
    bills: 4000,
    emergency: 3000,
    salary_goal: 6000,
    bills_goal: 5000,
    emergency_goal: 10000,
    is_premium: true,
    lgpd_accepted: true,
    transactions: [
      { id: "demo-1", amount: 1500,  category: "salario", description: "Pix de cliente #1",    created_at: "2026-04-13T09:00:00Z" },
      { id: "demo-2", amount: 1000,  category: "contas",  description: "Pagamento fornecedor", created_at: "2026-04-12T15:30:00Z" },
      { id: "demo-3", amount: 400,   category: "reserva", description: "Reserva de emergência",created_at: "2026-04-11T11:00:00Z" },
      { id: "demo-4", amount: 2000,  category: "salario", description: "Pix de cliente #2",    created_at: "2026-04-10T08:45:00Z" },
      { id: "demo-5", amount: 600,   category: "contas",  description: "Despesa operacional",  created_at: "2026-04-09T14:20:00Z" },
    ],
  };
}

function num(v: unknown): number {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

function mockResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function handlePixPost(init?: RequestInit): Promise<Response> {
  let valor = 0;
  let description = "Entrada Manual";
  try {
    const body = JSON.parse((init?.body as string) ?? "{}");
    valor = num(body.valor_pix);
    description = body.description || "Entrada Manual";
  } catch { /* ignore */ }

  if (valor <= 0) {
    return mockResponse({ detail: "Valor inválido." }, 400);
  }

  const allocated_salary    = num((valor * 0.30).toFixed(2));
  const allocated_bills     = num((valor * 0.40).toFixed(2));
  const allocated_emergency = num((valor * 0.30).toFixed(2));

  _state.salary    = num((_state.salary    + allocated_salary).toFixed(2));
  _state.bills     = num((_state.bills     + allocated_bills).toFixed(2));
  _state.emergency = num((_state.emergency + allocated_emergency).toFixed(2));

  const newTx: DemoTx = {
    id: `demo-pix-${Date.now()}`,
    amount: num(valor.toFixed(2)),
    category: "salario",
    description,
    created_at: new Date().toISOString(),
  };
  _state.transactions = [newTx, ..._state.transactions].slice(0, 10);

  window.dispatchEvent(new CustomEvent(DEMO_PIX_EVENT));

  return mockResponse({ allocated_salary, allocated_bills, allocated_emergency });
}

export function installDemoInterceptor(): void {
  if (_originalFetch) return;
  _originalFetch = window.fetch.bind(window);
  setDemoToken(DEMO_FAKE_TOKEN);
  resetState();

  window.fetch = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : (input as Request).url;

    const method = (
      init?.method ??
      (input instanceof Request ? input.method : "GET")
    ).toUpperCase();

    const isApiCall = url.includes("/api/");
    const isDemoEndpoint = url.includes("/api/demo/");

    if (!isApiCall || isDemoEndpoint) {
      return _originalFetch!(input, init);
    }

    if (method === "POST" && url.includes("/api/dividir-pix")) {
      return handlePixPost(init);
    }

    if (method !== "GET") {
      console.log(`[Demo] Ação bloqueada no modo demo: ${method} ${url}`);
      return mockResponse({ ok: true, demo: true });
    }

    if (url.includes("/api/saldos")) {
      return mockResponse({
        salary:         num(_state.salary),
        bills:          num(_state.bills),
        emergency:      num(_state.emergency),
        salary_goal:    num(_state.salary_goal),
        bills_goal:     num(_state.bills_goal),
        emergency_goal: num(_state.emergency_goal),
      });
    }

    if (url.includes("/api/transactions")) {
      return mockResponse({
        transactions: _state.transactions.map((t) => ({
          ...t,
          amount: num(t.amount),
        })),
      });
    }

    if (url.includes("/relatorio/")) {
      const demoRelatorioUrl = url.replace(/\/api\/usuario\/[^/]+\/relatorio\/mensal.*/, "/api/demo/relatorio");
      return _originalFetch!(demoRelatorioUrl);
    }

    if (url.includes("/api/usuario/")) {
      return mockResponse({
        is_premium:     _state.is_premium,
        lgpd_accepted:  _state.lgpd_accepted,
        connections:    [],
        billable_units: 0,
      });
    }

    return mockResponse({});
  };
}

export function uninstallDemoInterceptor(): void {
  if (_originalFetch) {
    window.fetch = _originalFetch;
    _originalFetch = null;
    setDemoToken(null);
    resetState();
  }
}

export { DEMO_PIX_EVENT };
