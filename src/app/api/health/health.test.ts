import { describe, expect, it } from "vitest";

import { GET } from "./route";

describe("GET /api/health", () => {
  it("reports the app is running", async () => {
    const response = GET();
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      name: string;
      status: string;
      phase: string;
      checks: Record<string, boolean>;
    };

    expect(body.name).toBe("lumen");
    expect(body.status).toBe("ok");
    expect(body.phase).toBe("foundation");
    expect(body.checks).toHaveProperty("supabaseConfigured");
  });
});
