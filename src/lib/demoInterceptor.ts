import { setDemoToken } from "@/lib/supabase";

const DEMO_ENDPOINT = "/api/demo/data";
const DEMO_FAKE_TOKEN = "demo-access-token";

let _originalFetch: typeof window.fetch | null = null;
let _demoCache: Record<string, unknown> | null = null;

async function getDemoData(): Promise<Record<string, unknown>> {
  if (_demoCache) return _demoCache;
  const data = await _originalFetch!(DEMO_ENDPOINT);
  _demoCache = await data.json();
  return _demoCache!;
}

function mockResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function installDemoInterceptor(): void {
  if (_originalFetch) return;
  _originalFetch = window.fetch.bind(window);
  setDemoToken(DEMO_FAKE_TOKEN);

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

    if (method !== "GET") {
      console.log(`[Demo] Ação bloqueada no modo demo: ${method} ${url}`);
      return mockResponse({ ok: true, demo: true });
    }

    try {
      const data = await getDemoData();

      if (url.includes("/api/saldos")) {
        return mockResponse({
          salary: data.salary,
          bills: data.bills,
          emergency: data.emergency,
          salary_goal: data.salary_goal,
          bills_goal: data.bills_goal,
          emergency_goal: data.emergency_goal,
        });
      }

      if (url.includes("/api/transactions")) {
        return mockResponse({ transactions: data.transactions });
      }

      if (url.includes("/api/usuario/")) {
        return mockResponse({
          is_premium: data.is_premium,
          lgpd_accepted: data.lgpd_accepted,
          connections: [],
          billable_units: 0,
        });
      }

      return mockResponse({});
    } catch {
      return mockResponse({});
    }
  };
}

export function uninstallDemoInterceptor(): void {
  if (_originalFetch) {
    window.fetch = _originalFetch;
    _originalFetch = null;
    _demoCache = null;
    setDemoToken(null);
  }
}
