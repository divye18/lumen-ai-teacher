import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Default config = UNIT tests only.
 *
 * Integration tests (`*.integration.test.ts`) need a live Supabase stack and
 * are run separately via `npm run test:integration`
 * (see `vitest.integration.config.mts`).
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["node_modules/**", "src/**/*.integration.{test,spec}.{ts,tsx}"],
  },
  resolve: {
    alias: {
      // `server-only` is a build-time marker with no Node entry point; stub it
      // so server modules can be unit-tested.
      "server-only": fileURLToPath(
        new URL("./test/server-only-stub.ts", import.meta.url),
      ),
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
