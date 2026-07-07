import { BrowserCookieAuthStorageAdapter } from "@supabase/auth-helpers-shared";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | undefined;

// Bypass navigator.locks — auth-js 2.106 defaults to navigatorLock in browsers,
// which can deadlock getSession() in Firefox and under overlapping auth calls.
const bypassAuthLock = async <R>(
  _name: string,
  _acquireTimeout: number,
  fn: () => Promise<R>,
): Promise<R> => fn();

export function createClient(): SupabaseClient {
  if (!browserClient) {
    browserClient = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: {
          flowType: "pkce",
          autoRefreshToken: true,
          detectSessionInUrl: true,
          persistSession: true,
          storage: new BrowserCookieAuthStorageAdapter(),
          lock: bypassAuthLock,
        },
      },
    );
  }
  return browserClient;
}
