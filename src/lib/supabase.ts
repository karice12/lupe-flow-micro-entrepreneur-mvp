import { createClient, SupabaseClient, RealtimeChannel } from "@supabase/supabase-js";

// Pegando as chaves que você já salvou na Vercel
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

let _client: SupabaseClient | null = null;

export function getSupabaseClient(): Promise<SupabaseClient | null> {
  if (_client) return Promise.resolve(_client);

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("Configurações do Supabase não encontradas!");
    return Promise.resolve(null);
  }

  _client = createClient(supabaseUrl, supabaseAnonKey, {
    realtime: { params: { eventsPerSecond: 10 } },
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  return Promise.resolve(_client);
}

export async function getAccessToken(): Promise<string | null> {
  const sb = await getSupabaseClient();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data.session?.access_token ?? null;
}

export type { RealtimeChannel };
