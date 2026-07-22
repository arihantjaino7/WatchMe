import { describe, expect, it } from "vitest";
import {
  ActivityInterpretationSchema,
  buildGroundedInterpretationSchema,
  EpisodeSchema,
} from "./activity-interpretation";
import type { TimelineBlock } from "./compiled-timeline";

function validEpisode(overrides: Record<string, unknown> = {}) {
  return {
    label: "Debugging a React state bug",
    category: "coding",
    blockIndices: [0],
    confidence: 0.8,
    relevanceToIntent: "aligned",
    isDistraction: false,
    evidenceNote: "30 minutes on github.com viewing the Issue thread.",
    ...overrides,
  };
}

function validInterpretation(overrides: Record<string, unknown> = {}) {
  return {
    episodes: [validEpisode()],
    uncertaintyNote: null,
    ...overrides,
  };
}

function block(overrides: Partial<TimelineBlock> = {}): TimelineBlock {
  return {
    kind: "activity",
    startedAt: new Date(0).toISOString(),
    endedAt: new Date(60_000).toISOString(),
    durationMs: 60_000,
    domain: "github.com",
    category: "coding",
    title: "Issue",
    isFocus: false,
    ...overrides,
  };
}

describe("EpisodeSchema / ActivityInterpretationSchema", () => {
  it("accepts a well-formed interpretation", () => {
    expect(ActivityInterpretationSchema.safeParse(validInterpretation()).success).toBe(true);
  });

  it("rejects an empty episodes array", () => {
    expect(
      ActivityInterpretationSchema.safeParse(validInterpretation({ episodes: [] })).success,
    ).toBe(false);
  });

  it("rejects an episode with an empty label", () => {
    expect(EpisodeSchema.safeParse(validEpisode({ label: "" })).success).toBe(false);
  });

  it("rejects an episode with no blockIndices", () => {
    expect(EpisodeSchema.safeParse(validEpisode({ blockIndices: [] })).success).toBe(false);
  });

  it("rejects a confidence outside 0..1", () => {
    expect(EpisodeSchema.safeParse(validEpisode({ confidence: 1.5 })).success).toBe(false);
  });

  it("rejects an unknown relevanceToIntent value", () => {
    expect(EpisodeSchema.safeParse(validEpisode({ relevanceToIntent: "somewhat" })).success).toBe(
      false,
    );
  });

  it("rejects arbitrary extra keys (strict, no free-form output)", () => {
    expect(
      ActivityInterpretationSchema.safeParse(validInterpretation({ mood: "focused" })).success,
    ).toBe(false);
  });

  it("accepts startedAt/endedAt/durationMs being absent (never asked of the model)", () => {
    const episode = validEpisode();
    expect("startedAt" in episode).toBe(false);
    const result = EpisodeSchema.safeParse(episode);
    expect(result.success).toBe(true);
  });
});

describe("buildGroundedInterpretationSchema", () => {
  it("accepts an episode grounded in a real activity block", () => {
    const schema = buildGroundedInterpretationSchema([block()]);
    expect(schema.safeParse(validInterpretation()).success).toBe(true);
  });

  it("rejects an episode citing an out-of-range block index", () => {
    const schema = buildGroundedInterpretationSchema([block()]);
    const result = schema.safeParse(
      validInterpretation({ episodes: [validEpisode({ blockIndices: [5] })] }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain("no block at index 5");
      expect(result.error.issues[0]?.path).toEqual(["episodes", 0, "blockIndices", 0]);
    }
  });

  it("rejects an episode citing an idle block (cannot be work)", () => {
    const blocks = [block({ kind: "idle", domain: null, category: null, title: null })];
    const schema = buildGroundedInterpretationSchema(blocks);
    const result = schema.safeParse(validInterpretation());
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain('not "activity"');
    }
  });

  it("rejects an episode citing a redacted block (cannot be work)", () => {
    const blocks = [block({ kind: "redacted", domain: null, category: null, title: null })];
    const schema = buildGroundedInterpretationSchema(blocks);
    expect(schema.safeParse(validInterpretation()).success).toBe(false);
  });

  it("rejects the same block index reused across two episodes", () => {
    const blocks = [block()];
    const schema = buildGroundedInterpretationSchema(blocks);
    const result = schema.safeParse(
      validInterpretation({
        episodes: [validEpisode({ label: "First pass" }), validEpisode({ label: "Second pass" })],
      }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes("already used"))).toBe(true);
    }
  });

  it("accepts multiple episodes citing disjoint blocks", () => {
    const blocks = [block(), block({ domain: "reddit.com", category: "entertainment" })];
    const schema = buildGroundedInterpretationSchema(blocks);
    const result = schema.safeParse(
      validInterpretation({
        episodes: [
          validEpisode({ blockIndices: [0] }),
          validEpisode({ label: "Browsing reddit", blockIndices: [1], isDistraction: true }),
        ],
      }),
    );
    expect(result.success).toBe(true);
  });
});
