import { createClient, SupabaseClient, RealtimeChannel } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;
let _initPromise: Promise<SupabaseClient | null> | null = null;

async function initSupabase(): Promise<SupabaseClient | null> {
  try {
    const res = await fetch("/api/config/supabase");
    if (!res.ok) return null;
    const { url, anon_key } = await res.json();
    if (!url || !anon_key) return null;
    _client = createClient(url, anon_key, {
      realtime: { params: { eventsPerSecond: 10 } },
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
    return _client;
  } catch {
    return null;
  }
}

export function getSupabaseClient(): Promise<SupabaseClient | null> {
  if (_client) return Promise.resolve(_client);
  if (!_initPromise) _initPromise = initSupabase();
  return _initPromise;
}

export type { RealtimeChannel };
