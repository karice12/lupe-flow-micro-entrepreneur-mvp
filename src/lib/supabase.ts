import { createClient, SupabaseClient, RealtimeChannel } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;
let _initPromise: Promise<SupabaseClient | null> | null = null;

async function initClient(): Promise<SupabaseClient | null> {
  const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL ?? "").trim().replace(/^["']|["']$/g, "");
  const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? "").trim().replace(/^["']|["']$/g, "");

  if (!supabaseUrl || !supabaseAnonKey || !supabaseUrl.startsWith("http")) {
    console.error("[Supabase] VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY não definidas.");
    return null;
  }

  _client = createClient(supabaseUrl, supabaseAnonKey, {
    realtime: { params: { eventsPerSecond: 10 } },
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  return _client;
}

export function getSupabaseClient(): Promise<SupabaseClient | null> {
  if (_client) return Promise.resolve(_client);
  if (!_initPromise) _initPromise = initClient();
  return _initPromise;
}

export async function getAccessToken(): Promise<string | null> {
  const sb = await getSupabaseClient();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data.session?.access_token ?? null;
}

export type { RealtimeChannel };
