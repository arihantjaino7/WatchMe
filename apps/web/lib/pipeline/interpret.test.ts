import { describe, expect, it } from "vitest";
import { COMPILER_VERSION, type CompiledTimeline } from "@watchme/shared";
import type { LlmGenerateResult, LlmProvider } from "../llm/provider";
import { generateInterpretation } from "./interpret";

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
      {
        kind: "idle",
        startedAt: new Date(1_700_000_000_000 + 30 * 60_000).toISOString(),
        endedAt: new Date(1_700_000_000_000 + 35 * 60_000).toISOString(),
        durationMs: 5 * 60_000,
        domain: null,
        category: null,
        title: null,
        isFocus: false,
      },
    ],
  };
}

const VALID_INTERPRETATION = JSON.stringify({
  episodes: [
    {
      label: "Reviewing a GitHub issue",
      category: "coding",
      blockIndices: [0],
      confidence: 0.8,
      relevanceToIntent: "aligned",
      isDistraction: false,
      evidenceNote: "30 minutes on github.com viewing the Issue thread.",
    },
  ],
  uncertaintyNote: null,
});

/** References block index 1 (idle), which grounding must reject. */
const UNGROUNDED_INTERPRETATION = JSON.stringify({
  episodes: [
    {
      label: "Reviewing a GitHub issue",
      category: "coding",
      blockIndices: [1],
      confidence: 0.8,
      relevanceToIntent: "aligned",
      isDistraction: false,
      evidenceNote: "30 minutes on github.com viewing the Issue thread.",
    },
  ],
  uncertaintyNote: null,
});

function fakeProvider(texts: string[]) {
  const provider = {
    name: "fake",
    calls: 0,
    async generate(): Promise<LlmGenerateResult> {
      const text = texts[Math.min(provider.calls, texts.length - 1)]!;
      provider.calls += 1;
      return { text, usage: { inputTokens: 100, outputTokens: 60 } };
    },
  };
  return provider satisfies LlmProvider & { calls: number };
}

describe("generateInterpretation", () => {
  it("returns a grounded, schema-validated interpretation from the model output", async () => {
    const provider = fakeProvider([VALID_INTERPRETATION]);
    const result = await generateInterpretation(timeline(), "Ship the auth fix", { provider });

    expect(provider.calls).toBe(1);
    expect(result.model).toBe("gemini-2.0-flash");
    expect(result.data.episodes).toHaveLength(1);
    expect(result.data.episodes[0]!.blockIndices).toEqual([0]);
  });

  it("retries when an episode cites a non-activity block, and succeeds on correction", async () => {
    const provider = fakeProvider([UNGROUNDED_INTERPRETATION, VALID_INTERPRETATION]);
    const result = await generateInterpretation(timeline(), "Ship the auth fix", { provider });

    expect(provider.calls).toBe(2);
    expect(result.data.episodes[0]!.blockIndices).toEqual([0]);
  });

  it("throws LlmError(invalid_output) when the model never grounds its episodes", async () => {
    const provider = fakeProvider([UNGROUNDED_INTERPRETATION]);

    await expect(
      generateInterpretation(timeline(), "Ship the auth fix", { provider }),
    ).rejects.toMatchObject({ kind: "invalid_output" });
    expect(provider.calls).toBe(2); // exhausted the default 2 attempts
  });

  it("rejects an episode citing an out-of-range block index", async () => {
    const outOfRange = JSON.stringify({
      episodes: [
        {
          label: "Reviewing a GitHub issue",
          category: "coding",
          blockIndices: [99],
          confidence: 0.8,
          relevanceToIntent: "aligned",
          isDistraction: false,
          evidenceNote: "x",
        },
      ],
      uncertaintyNote: null,
    });
    const provider = fakeProvider([outOfRange]);

    await expect(
      generateInterpretation(timeline(), null, { provider, maxAttempts: 1 }),
    ).rejects.toMatchObject({ kind: "invalid_output" });
  });
});
