import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * INTEGRATION test config. Runs only `*.integration.test.ts`, which self-skip
 * unless LUMEN_TEST_SUPABASE_URL and LUMEN_TEST_SERVICE_ROLE_KEY are set.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.integration.{test,spec}.{ts,tsx}"],
  },
  resolve: {
    alias: {
      "server-only": fileURLToPath(
        new URL("./test/server-only-stub.ts", import.meta.url),
      ),
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
