import type {
  ActivityInterpretation,
  CompiledTimeline,
  Episode,
  Reflection,
} from "@watchme/shared";
import { compile, type CompilerInputEvent } from "../../lib/pipeline/compiler";

/**
 * Ergonomic builders for evaluation fixtures. Timelines are produced by the
 * REAL compiler from a synthetic event stream (so they're authentic and any
 * compiler change is reflected), and episode/reflection outputs are authored as
 * typed objects (so the compiler catches shape mistakes) then serialized to the
 * raw JSON strings the fixture provider returns.
 */

const T0 = 1_700_000_000_000;
export const MIN = 60_000;
export const at = (min: number, sec = 0): number => T0 + min * MIN + sec * 1_000;

export type SessionBuilder = {
  /** Focus a tab on `domain` with `title` at minute `atMin` (opens a context). */
  focus(atMin: number, domain: string, title: string): SessionBuilder;
  /** Blur the current tab at minute `atMin` (closes the open context). */
  blur(atMin: number): SessionBuilder;
  /** An idle gap [startMin, endMin]; the focused tab resumes afterward. */
  idle(startMin: number, endMin: number): SessionBuilder;
  /** A completed blocklisted span of `durationMin` ending at minute `endMin`. */
  redacted(endMin: number, durationMin: number): SessionBuilder;
  /** Compile the accumulated events into a CompiledTimeline ending at `endMin`. */
  compile(endMin: number): CompiledTimeline;
};

export function session(startMin = 0): SessionBuilder {
  const events: CompilerInputEvent[] = [];
  const builder: SessionBuilder = {
    focus(atMin, domain, title) {
      events.push({ type: "tab_focus", occurredAt: at(atMin), domain, title });
      return builder;
    },
    blur(atMin) {
      events.push({ type: "tab_blur", occurredAt: at(atMin) });
      return builder;
    },
    idle(startMin, endMin) {
      events.push({ type: "idle_start", occurredAt: at(startMin) });
      events.push({ type: "idle_end", occurredAt: at(endMin) });
      return builder;
    },
    redacted(endMin, durationMin) {
      events.push({ type: "redacted", occurredAt: at(endMin), durationMs: durationMin * MIN });
      return builder;
    },
    compile(endMin) {
      return compile(events, { startedAtMs: at(startMin), endedAtMs: at(endMin) });
    },
  };
  return builder;
}

/** Indices (in timeline order) of activity blocks whose domain matches. */
export function activityIndices(timeline: CompiledTimeline, domain: string): number[] {
  return timeline.blocks
    .map((block, index) => ({ block, index }))
    .filter((entry) => entry.block.kind === "activity" && entry.block.domain === domain)
    .map((entry) => entry.index);
}

/** First activity-block index for a domain. Throws if absent -- catches authoring mistakes early. */
export function blockIndex(timeline: CompiledTimeline, domain: string): number {
  const index = activityIndices(timeline, domain)[0];
  if (index === undefined) throw new Error(`no activity block for "${domain}" in the timeline`);
  return index;
}

/** Typed Episode constructor with sensible defaults, so cases stay concise. */
export function episode(
  fields: Pick<Episode, "label" | "category" | "blockIndices"> & Partial<Episode>,
): Episode {
  return {
    confidence: 0.8,
    relevanceToIntent: "aligned",
    isDistraction: false,
    evidenceNote: "Grounded in the cited timeline blocks.",
    ...fields,
  };
}

export function interpretation(
  episodes: Episode[],
  uncertaintyNote: string | null = null,
): ActivityInterpretation {
  return { episodes, uncertaintyNote };
}

/** Identity helper: types a reflection literal against the real schema type. */
export function reflection(value: Reflection): Reflection {
  return value;
}

export const json = (value: unknown): string => JSON.stringify(value);
