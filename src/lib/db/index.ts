/**
 * Database integration (Supabase Postgres + pgvector).
 *
 * Import sites are deliberately explicit:
 * - Client code:  `@/lib/db/client`  → `getSupabaseBrowserClient()`
 * - Server code:  `@/lib/db/server`  → `getSupabaseServerClient()` / admin
 * - Repositories: `@/lib/db/repositories`
 *
 * This barrel only re-exports the browser-safe surface (plus type-only
 * exports) so it can be imported from anywhere without pulling in
 * `server-only` modules.
 */
export { getSupabaseBrowserClient } from "./client";
export type { LumenSupabaseClient } from "./client";
export type {
  Database,
  Json,
  Tables,
  TablesInsert,
  TablesUpdate,
} from "./types";
