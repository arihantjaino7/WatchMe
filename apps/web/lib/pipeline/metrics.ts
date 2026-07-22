import type { CompiledTimeline } from "@watchme/shared";

/**
 * Shapes the compiler's `CompiledTimeline` into the compact, human-readable
 * payload handed to the LLM prompts. Pure transform: it re-expresses numbers
 * (ms -> minutes) but computes no new metrics -- the compiler stays the source
 * of truth. Shared evidence for both agents (Agent 1's interpreter and Agent
 * 2's reflection); each interprets it, neither recomputes it.
 */

/** Sessions with very little tracked activity -- the model must not over-read them. */
export const LOW_SIGNAL_ACTIVE_MINUTES = 10;

export type TimelineMetrics = {
  durations: {
    totalMinutes: number;
    activeMinutes: number;
    focusMinutes: number;
    idleMinutes: number;
    longestFocusMinutes: number;
  };
  focusPercentage: number;
  contextSwitches: number;
  categories: Array<{ category: string; minutes: number; percentage: number }>;
  websites: Array<{ domain: string; category: string; minutes: number; visits: number }>;
  timeline: Array<{
    /** Position in CompiledTimeline.blocks -- cite this in Agent 1's episode blockIndices. */
    index: number;
    kind: string;
    atMinute: number;
    durationMinutes: number;
    domain: string | null;
    category: string | null;
    title: string | null;
    isFocus: boolean;
  }>;
  signal: "low" | "normal";
};

const toMinutes = (ms: number): number => Math.round((ms / 60_000) * 10) / 10;

export function toTimelineMetrics(timeline: CompiledTimeline): TimelineMetrics {
  const origin = timeline.blocks.length
    ? Math.min(...timeline.blocks.map((b) => Date.parse(b.startedAt)))
    : 0;

  const activeMinutes = toMinutes(timeline.activeDurationMs);

  return {
    durations: {
      totalMinutes: toMinutes(timeline.totalDurationMs),
      activeMinutes,
      focusMinutes: toMinutes(timeline.focusDurationMs),
      idleMinutes: toMinutes(timeline.idleDurationMs),
      longestFocusMinutes: toMinutes(timeline.longestFocusBlockMs),
    },
    focusPercentage: timeline.focusPercentage,
    contextSwitches: timeline.contextSwitches,
    categories: timeline.appUsage.map((u) => ({
      category: u.category,
      minutes: toMinutes(u.durationMs),
      percentage: u.percentage,
    })),
    websites: timeline.websiteUsage.map((u) => ({
      domain: u.domain,
      category: u.category,
      minutes: toMinutes(u.durationMs),
      visits: u.visits,
    })),
    timeline: timeline.blocks.map((b, index) => ({
      index,
      kind: b.kind,
      atMinute: Math.round(((Date.parse(b.startedAt) - origin) / 60_000) * 10) / 10,
      durationMinutes: toMinutes(b.durationMs),
      domain: b.domain,
      category: b.category,
      title: b.title,
      isFocus: b.isFocus,
    })),
    signal: activeMinutes < LOW_SIGNAL_ACTIVE_MINUTES ? "low" : "normal",
  };
}
