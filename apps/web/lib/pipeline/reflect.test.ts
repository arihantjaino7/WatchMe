import { describe, expect, it } from "vitest";
import { COMPILER_VERSION, type CompiledTimeline } from "@watchme/shared";
import type { LlmGenerateResult, LlmProvider } from "../llm/provider";
import { generateReflection } from "./reflect";

function timeline(): CompiledTimeline {
  return {
    compilerVersion: COMPILER_VERSION,
    totalDurationMs: 60 * 60_000,
    activeDurationMs: 55 * 60_000,
    focusDurationMs: 43 * 60_000,
    idleDurationMs: 5 * 60_000,
    focusPercentage: 78,
    contextSwitches: 2,
    longestFocusBlockMs: 30 * 60_000,
    appUsage: [{ category: "coding", durationMs: 48 * 60_000, percentage: 87 }],
    websiteUsage: [
      { domain: "github.com", category: "coding", durationMs: 48 * 60_000, visits: 3 },
    ],
    blocks: [
      {
        kind: "activity",
        startedAt: new Date(1_700_000_000_000).toISOString(),
        endedAt: new Date(1_700_000_000_000 + 30 * 60_000).toISOString(),
        durationMs: 30 * 60_000,
        domain: "github.com",
        category: "coding",
        title: "Issue",
        isFocus: true,
      },
    ],
  };
}

const VALID_REFLECTION = JSON.stringify({
  narrative: "A focused coding session, mostly on github.com with a short idle break.",
  productivity: { label: "high", score: 80, assessment: "Sustained focus on coding." },
  distraction: { summary: "No notable distractions.", sources: [] },
  focus: {
    strongest: "A 30-minute block on github.com.",
    weakest: "A 5-minute idle gap mid-session.",
  },
  intent: { verdict: "aligned", assessment: "Coding time matches the shipping intent." },
  observations: ["Focus concentrated in one long block"],
  suggestions: ["Keep the single-context stretch; batch reviews after it."],
  confidence: 0.7,
});

function fakeProvider(text: string) {
  const provider = {
    name: "fake",
    calls: 0,
    async generate(): Promise<LlmGenerateResult> {
      provider.calls += 1;
      return { text, usage: { inputTokens: 100, outputTokens: 60 } };
    },
  };
  return provider satisfies LlmProvider & { calls: number };
}

describe("generateReflection", () => {
  it("returns a schema-validated reflection from the model output", async () => {
    const provider = fakeProvider(VALID_REFLECTION);
    const result = await generateReflection(timeline(), "Ship the auth fix", { provider });

    expect(provider.calls).toBe(1);
    expect(result.model).toBe("gemini-2.0-flash");
    expect(result.data.intent.verdict).toBe("aligned");
    expect(result.data.suggestions).toHaveLength(1);
    expect(result.data.confidence).toBeGreaterThan(0);
    expect(result.usage).toEqual({ inputTokens: 100, outputTokens: 60 });
  });

  it("rejects model output that violates the reflection schema", async () => {
    // Four suggestions -> ReflectionSchema.max(3) fails -> exhausts retries.
    const provider = fakeProvider(
      JSON.stringify({ ...JSON.parse(VALID_REFLECTION), suggestions: ["a", "b", "c", "d"] }),
    );
    await expect(
      generateReflection(timeline(), "Ship the auth fix", { provider }),
    ).rejects.toMatchObject({ kind: "invalid_output" });
  });
});
