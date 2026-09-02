/**
 * Configuration entry point.
 *
 * - `publicConfig` — safe for the browser, import anywhere.
 * - `serverConfig` — secrets; import only from server code (it is guarded by
 *   `server-only`). Import it directly from `@/config/server` so bundler errors
 *   point at the real call site.
 */
export { publicConfig, type PublicConfig } from "./public";
