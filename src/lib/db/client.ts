import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import { publicConfig } from "@/config/public";
import { LumenError } from "@/lib/errors";

/**
 * Browser-side Supabase client. Uses only PUBLIC config (project URL + anon
 * key). Row-Level Security in the database is the real trust boundary.
 *
 * The full database schema is designed and migrated in the next phase; this is
 * the integration foundation only.
 */
let browserClient: SupabaseClient | null = null;

export function getSupabaseBrowserClient(): SupabaseClient {
  if (!publicConfig.supabase.url || !publicConfig.supabase.anonKey) {
    throw new LumenError(
      "CONFIG_MISSING",
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
      { recoverable: true },
    );
  }
  browserClient ??= createBrowserClient(
    publicConfig.supabase.url,
    publicConfig.supabase.anonKey,
  );
  return browserClient;
}
