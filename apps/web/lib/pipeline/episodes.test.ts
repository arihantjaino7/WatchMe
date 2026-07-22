import { describe, expect, it } from "vitest";
import type { ActivityInterpretation, TimelineBlock } from "@watchme/shared";
import { deriveInterpretedActivity } from "./episodes";

const T0 = 1_700_000_000_000;
const MIN = 60_000;
const at = (min: number) => new Date(T0 + min * MIN).toISOString();

function activityBlock(startMin: number, endMin: number, domain = "github.com"): TimelineBlock {
  return {
    kind: "activity",
    startedAt: at(startMin),
    endedAt: at(endMin),
    durationMs: (endMin - startMin) * MIN,
    domain,
    category: "coding",
    title: "x",
    isFocus: false,
  };
}

describe("deriveInterpretedActivity", () => {
  it("derives timing for a single-block episode directly from that block", () => {
    const blocks = [activityBlock(0, 30)];
    const interpretation: ActivityInterpretation = {
      episodes: [
        {
          label: "Reviewing an issue",
          category: "coding",
          blockIndices: [0],
          confidence: 0.8,
          relevanceToIntent: "aligned",
          isDistraction: false,
          evidenceNote: "x",
        },
      ],
      uncertaintyNote: null,
    };

    const result = deriveInterpretedActivity(interpretation, blocks);
    const episode = result.episodes[0]!;
    expect(episode.startedAt).toBe(at(0));
    expect(episode.endedAt).toBe(at(30));
    expect(episode.durationMs).toBe(30 * MIN);
  });

  it("derives min-start/max-end/summed-duration across a multi-block episode with a gap", () => {
    // Episode spans blocks 0 and 2 with a distraction (block 1, not cited) in between.
    const blocks = [
      activityBlock(0, 20),
      activityBlock(20, 25, "reddit.com"),
      activityBlock(25, 40),
    ];
    const interpretation: ActivityInterpretation = {
      episodes: [
        {
          label: "Implementing OAuth",
          category: "coding",
          blockIndices: [0, 2],
          confidence: 0.7,
          relevanceToIntent: "aligned",
          isDistraction: false,
          evidenceNote: "x",
        },
      ],
      uncertaintyNote: null,
    };

    const result = deriveInterpretedActivity(interpretation, blocks);
    const episode = result.episodes[0]!;
    // Wall-clock span would be [0,40] = 40min, but summed active duration excludes the gap.
    expect(episode.startedAt).toBe(at(0));
    expect(episode.endedAt).toBe(at(40));
    expect(episode.durationMs).toBe((20 + 15) * MIN); // block0 (20min) + block2 (15min), gap excluded
  });

  it("passes through uncertaintyNote and non-timing episode fields unchanged", () => {
    const blocks = [activityBlock(0, 10)];
    const interpretation: ActivityInterpretation = {
      episodes: [
        {
          label: "Quick lookup",
          category: "docs",
          blockIndices: [0],
          confidence: 0.4,
          relevanceToIntent: "unknown",
          isDistraction: true,
          evidenceNote: "brief docs visit",
        },
      ],
      uncertaintyNote: "Very little tracked activity in this session.",
    };

    const result = deriveInterpretedActivity(interpretation, blocks);
    expect(result.uncertaintyNote).toBe("Very little tracked activity in this session.");
    expect(result.episodes[0]).toMatchObject({
      label: "Quick lookup",
      category: "docs",
      confidence: 0.4,
      relevanceToIntent: "unknown",
      isDistraction: true,
      evidenceNote: "brief docs visit",
    });
  });

  it("returns an empty episodes array for an empty interpretation input", () => {
    const result = deriveInterpretedActivity({ episodes: [], uncertaintyNote: null }, []);
    expect(result.episodes).toHaveLength(0);
  });
});
