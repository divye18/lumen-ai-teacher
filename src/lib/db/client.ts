import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import { publicConfig } from "@/config/public";
import { LumenError } from "@/lib/errors";

import type { Database } from "./types";

/**
 * Browser-side Supabase client. Uses only PUBLIC config (project URL + anon
 * key). Row-Level Security in the database is the real trust boundary — the
 * service-role key is never available here.
 */
export type LumenSupabaseClient = SupabaseClient<Database>;

let browserClient: LumenSupabaseClient | null = null;

export function getSupabaseBrowserClient(): LumenSupabaseClient {
  if (!publicConfig.supabase.url || !publicConfig.supabase.anonKey) {
    throw new LumenError(
      "CONFIG_MISSING",
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
      { recoverable: true },
    );
  }
  browserClient ??= createBrowserClient<Database>(
    publicConfig.supabase.url,
    publicConfig.supabase.anonKey,
  );
  return browserClient;
}
