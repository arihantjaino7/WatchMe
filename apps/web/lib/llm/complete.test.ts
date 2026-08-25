import { describe, expect, it } from "vitest";
import { z } from "zod";
import { complete } from "./index";
import { LlmError, type LlmGenerateResult, type LlmProvider } from "./provider";

const Schema = z.object({ answer: z.string(), score: z.number().int() }).strict();

/** Deterministic fake: returns queued texts in order, then repeats the last one. */
function fakeProvider(texts: string[]) {
  const provider = {
    name: "fake",
    calls: 0,
    async generate(): Promise<LlmGenerateResult> {
      const text = texts[Math.min(provider.calls, texts.length - 1)]!;
      provider.calls += 1;
      return { text, usage: { inputTokens: 10, outputTokens: 4 } };
    },
  };
  return provider satisfies LlmProvider & { calls: number };
}

/** Provider that always throws — models a transient provider/network failure. */
function throwingProvider(error: unknown) {
  const provider = {
    name: "throwing",
    calls: 0,
    async generate(): Promise<LlmGenerateResult> {
      provider.calls += 1;
      throw error;
    },
  };
  return provider satisfies LlmProvider & { calls: number };
}

const messages = [{ role: "user" as const, content: "go" }];

describe("complete", () => {
  it("returns validated data on a well-formed first response", async () => {
    const provider = fakeProvider(['{"answer":"yes","score":7}']);
    const result = await complete("reflect", messages, Schema, { provider });

    expect(result.data).toEqual({ answer: "yes", score: 7 });
    expect(result.model).toBe("gemini-2.0-flash");
    expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 4 });
    expect(provider.calls).toBe(1);
  });

  it("extracts JSON from a fenced/prose-wrapped response", async () => {
    const provider = fakeProvider(['Here you go:\n```json\n{"answer":"ok","score":3}\n```']);
    const result = await complete("reflect", messages, Schema, { provider });
    expect(result.data).toEqual({ answer: "ok", score: 3 });
  });

  it("retries after a schema failure and returns the corrected response", async () => {
    const provider = fakeProvider([
      '{"answer":"missing score"}', // invalid: no score
      '{"answer":"fixed","score":9}', // valid on retry
    ]);
    const result = await complete("reflect", messages, Schema, { provider });

    expect(result.data).toEqual({ answer: "fixed", score: 9 });
    expect(provider.calls).toBe(2);
  });

  it("throws LlmError(invalid_output) when output never validates", async () => {
    const provider = fakeProvider(["not json at all"]);

    await expect(complete("reflect", messages, Schema, { provider })).rejects.toMatchObject({
      name: "LlmError",
      kind: "invalid_output",
    });
    // Exhausted the default 2 attempts, never silently passed bad output through.
    expect(provider.calls).toBe(2);
  });

  it("propagates a provider error without retrying (Inngest owns transient retry)", async () => {
    const provider = throwingProvider(new LlmError("provider", "network down"));

    await expect(complete("reflect", messages, Schema, { provider })).rejects.toMatchObject({
      kind: "provider",
    });
    expect(provider.calls).toBe(1);
  });

  it("respects a custom maxAttempts", async () => {
    const provider = fakeProvider(["nope"]);
    await expect(
      complete("reflect", messages, Schema, { provider, maxAttempts: 3 }),
    ).rejects.toBeInstanceOf(LlmError);
    expect(provider.calls).toBe(3);
  });
});
