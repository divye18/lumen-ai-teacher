import "server-only";

import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import { serverConfig } from "@/config/server";
import { LumenError } from "@/lib/errors";

function assertConfigured(): { url: string; anonKey: string } {
  const { url, anonKey } = serverConfig.supabase;
  if (!url || !anonKey) {
    throw new LumenError(
      "CONFIG_MISSING",
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
      { recoverable: true },
    );
  }
  return { url, anonKey };
}

/**
 * Request-scoped Supabase client for Server Components, Route Handlers and
 * Server Actions. Reads/writes the Supabase auth cookies so sessions persist.
 */
export async function getSupabaseServerClient(): Promise<SupabaseClient> {
  const { url, anonKey } = assertConfigured();
  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(toSet) {
        try {
          for (const { name, value, options } of toSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // `setAll` is called from a Server Component render; cookie writes
          // there are a no-op. Middleware refreshes the session instead.
        }
      },
    },
  });
}

/**
 * Privileged client using the service-role key. Bypasses Row-Level Security —
 * use only in trusted server code (background jobs, admin tasks), never in a
 * path driven by unvalidated user input.
 */
export function getSupabaseAdminClient(): SupabaseClient {
  const { url } = assertConfigured();
  const serviceRoleKey = serverConfig.supabase.serviceRoleKey;
  if (!serviceRoleKey) {
    throw new LumenError(
      "CONFIG_MISSING",
      "SUPABASE_SERVICE_ROLE_KEY is not set; the admin client is unavailable.",
      { recoverable: true },
    );
  }
  return createServerClient(url, serviceRoleKey, {
    cookies: { getAll: () => [], setAll: () => {} },
  });
}
