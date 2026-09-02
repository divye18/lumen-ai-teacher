/**
 * Database integration foundation (Supabase Postgres + pgvector).
 *
 * Import sites are deliberately explicit:
 * - Client code:  `@/lib/db/client`  → `getSupabaseBrowserClient()`
 * - Server code:  `@/lib/db/server`  → `getSupabaseServerClient()` / admin
 *
 * This barrel only re-exports the browser-safe surface so it can be imported
 * from anywhere without pulling in `server-only` modules.
 */
export { getSupabaseBrowserClient } from "./client";
