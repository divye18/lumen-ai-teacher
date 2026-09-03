import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { AiGenerationError } from "@/lib/errors";
import { ok, type Result } from "@/lib/result";

import { extractJsonObject, generateStructured } from "./structured";
import type { LLMGenerateResult, LLMProvider } from "./types";

function providerReturning(texts: string[]): {
  provider: LLMProvider;
  calls: () => number;
} {
  let i = 0;
  const generate = vi.fn(async (): Promise<Result<LLMGenerateResult>> =>
    ok({
      text: texts[Math.min(i++, texts.length - 1)],
      model: "fake",
      finishReason: "stop" as const,
    }),
  );
  return {
    provider: { id: "fake", generate },
    calls: () => generate.mock.calls.length,
  };
}

const schema = z.object({ action: z.enum(["A", "B"]), n: z.number() });

describe("extractJsonObject", () => {
  it("parses raw JSON", () => {
    expect(extractJsonObject('{"a":1}')).toEqual({ a: 1 });
  });
  it("parses a fenced ```json block", () => {
    expect(extractJsonObject('here:\n```json\n{"a":2}\n```')).toEqual({ a: 2 });
  });
  it("extracts the first balanced object from noisy text", () => {
    expect(extractJsonObject('Sure! {"a": {"b": 3}} hope that helps')).toEqual({
      a: { b: 3 },
    });
  });
  it("returns undefined when there is no object", () => {
    expect(extractJsonObject("no json here")).toBeUndefined();
  });
});

describe("generateStructured", () => {
  it("validates a good first response without repair", async () => {
    const { provider, calls } = providerReturning(['{"action":"A","n":1}']);
    const res = await generateStructured({
      provider,
      schema,
      system: "s",
      user: "u",
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.value).toEqual({ action: "A", n: 1 });
      expect(res.value.repaired).toBe(false);
    }
    expect(calls()).toBe(1);
  });

  it("repairs once when the first response is invalid", async () => {
    const { provider, calls } = providerReturning([
      "totally not json",
      '{"action":"B","n":5}',
    ]);
    const res = await generateStructured({
      provider,
      schema,
      system: "s",
      user: "u",
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.repaired).toBe(true);
    expect(calls()).toBe(2);
  });

  it("returns MALFORMED_AI_OUTPUT when output never validates", async () => {
    const { provider } = providerReturning([
      '{"action":"Z"}',
      '{"still":"wrong"}',
      "nope",
    ]);
    const res = await generateStructured({
      provider,
      schema,
      system: "s",
      user: "u",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("MALFORMED_AI_OUTPUT");
  });

  it("surfaces a provider transport failure immediately", async () => {
    const provider: LLMProvider = {
      id: "fake",
      generate: vi.fn(async () => ({
        ok: false as const,
        error: new AiGenerationError("boom"),
      })),
    };
    const res = await generateStructured({
      provider,
      schema,
      system: "s",
      user: "u",
    });
    expect(res.ok).toBe(false);
  });
});
