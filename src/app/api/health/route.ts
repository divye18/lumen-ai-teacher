import { NextResponse } from "next/server";

import { serverConfig } from "@/config/server";
import { isEmbeddingConfigured, isLLMConfigured } from "@/lib/ai/registry";

/** Health check. Confirms the app is running and reports coarse readiness. */
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    name: "lumen",
    status: "ok",
    phase: "foundation",
    environment: serverConfig.appEnv,
    time: new Date().toISOString(),
    checks: {
      supabaseConfigured: Boolean(serverConfig.supabase.url),
      llmProviderRegistered: isLLMConfigured(),
      embeddingProviderRegistered: isEmbeddingConfigured(),
    },
  });
}
