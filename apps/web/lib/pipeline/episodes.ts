import type { ActivityInterpretation, Episode, TimelineBlock } from "@watchme/shared";

/**
 * Post-processes Agent 1's grounded output into timed episodes for Agent 2.
 * Pure, no I/O, no LLM call. Once `blockIndices` has passed grounding
 * validation, an episode's timing is fully determined by the blocks it cites
 * -- so it is derived here in code, never trusted from model output (mirrors
 * Agent 2's own "you interpret, you do not calculate" rule, applied to Agent 1).
 */

export type TimedEpisode = Episode & {
  startedAt: string;
  endedAt: string;
  /** Sum of the referenced blocks' durationMs -- robust to gaps between an
   *  episode's blocks (e.g. a distraction sandwiched between two same-topic
   *  visits), unlike the wall-clock span from startedAt to endedAt. */
  durationMs: number;
};

export type InterpretedActivity = {
  episodes: TimedEpisode[];
  uncertaintyNote: string | null;
};

export function deriveInterpretedActivity(
  interpretation: ActivityInterpretation,
  blocks: readonly TimelineBlock[],
): InterpretedActivity {
  return {
    episodes: interpretation.episodes.map((episode) => deriveEpisodeTiming(episode, blocks)),
    uncertaintyNote: interpretation.uncertaintyNote,
  };
}

function deriveEpisodeTiming(episode: Episode, blocks: readonly TimelineBlock[]): TimedEpisode {
  const cited = episode.blockIndices.map((i) => blocks[i]!);

  const startedAtMs = Math.min(...cited.map((b) => Date.parse(b.startedAt)));
  const endedAtMs = Math.max(...cited.map((b) => Date.parse(b.endedAt)));
  const durationMs = cited.reduce((total, b) => total + b.durationMs, 0);

  return {
    ...episode,
    startedAt: new Date(startedAtMs).toISOString(),
    endedAt: new Date(endedAtMs).toISOString(),
    durationMs,
  };
}
