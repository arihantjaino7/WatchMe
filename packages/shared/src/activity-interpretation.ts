import { z, ZodIssueCode, type ZodType } from "zod";
import { CategorySchema } from "./domain-category";
import type { TimelineBlock } from "./compiled-timeline";

/**
 * The Activity Interpreter's structured output (Agent 1, ARCHITECTURE.md §8).
 *
 * Groups compiled timeline blocks into labeled "work episodes" -- semantic
 * labeling the static domain->category map can't do (e.g. "debugging a React
 * state bug" vs. just "coding"). Strict by construction like `reflection.ts`'s
 * ReflectionSchema. Persisted as raw JSON in `interpretations.interpretation`.
 *
 * Grounding, not just prompting, keeps the model from inventing unseen work:
 * every episode must cite `blockIndices` into the real compiled timeline, and
 * `buildGroundedInterpretationSchema` (built fresh per call, closed over that
 * session's actual blocks) rejects any episode citing a block that doesn't
 * exist, isn't an "activity" block, or was already claimed by another episode.
 * This guarantees episodes are ANCHORED to real evidence -- it cannot guarantee
 * an episode's `label` text is a faithful reading of that evidence; that is a
 * prompt-quality/eval-harness concern, not something a schema can catch.
 */

/** Identifies the prompt+schema revision that produced an interpretation. */
export const INTERPRETATION_PROMPT_VERSION = "interpret-v1-2026-07-22";

/**
 * How an episode measures up against the declared intent. `no_intent` mirrors
 * ReflectionSchema's IntentVerdictSchema distinction: no intent was declared
 * is a different case from "evidence doesn't tell us" (`unknown`).
 */
export const RelevanceToIntentSchema = z.enum([
  "aligned",
  "partial",
  "unrelated",
  "unknown",
  "no_intent",
]);
export type RelevanceToIntent = z.infer<typeof RelevanceToIntentSchema>;

const NonEmpty = z.string().min(1);

/**
 * A labeled work episode. Deliberately carries NO startedAt/endedAt/durationMs
 * -- once `blockIndices` passes grounding validation those are fully
 * determined by the blocks they reference, so they're derived in code
 * (see apps/web/lib/pipeline/episodes.ts), never trusted from model output.
 */
export const EpisodeSchema = z
  .object({
    /** Short, specific description of the inferred work, e.g. "Debugging a React state bug". */
    label: NonEmpty,
    category: CategorySchema,
    /** Indices into the compiled timeline's blocks array that ground this episode in evidence. */
    blockIndices: z.array(z.number().int().nonnegative()).min(1),
    confidence: z.number().min(0).max(1),
    relevanceToIntent: RelevanceToIntentSchema,
    /** Flags a rabbit-hole/distraction candidate (ARCHITECTURE.md §8 uses both terms for this). */
    isDistraction: z.boolean(),
    /** Short factual pointer to the domains/titles backing this episode -- no invented detail. */
    evidenceNote: NonEmpty,
  })
  .strict();
export type Episode = z.infer<typeof EpisodeSchema>;

export const ActivityInterpretationSchema = z
  .object({
    episodes: z.array(EpisodeSchema).min(1),
    /** Free-text caveat when the session's evidence is thin or ambiguous; null otherwise. */
    uncertaintyNote: z.string().nullable(),
  })
  .strict();
export type ActivityInterpretation = z.infer<typeof ActivityInterpretationSchema>;

/**
 * Builds a schema closed over the real compiled timeline for one analysis run.
 * Passed into `complete()`, whose existing retry-on-schema-failure loop
 * re-prompts the model with a pinpoint message when grounding fails --
 * `superRefine`'s custom issues are formatted identically to ordinary field
 * errors by `parseAgainstSchema`, so no changes to `complete()` are needed.
 * Build fresh per call; never share an instance across timelines.
 */
export function buildGroundedInterpretationSchema(
  blocks: readonly TimelineBlock[],
): ZodType<ActivityInterpretation> {
  return ActivityInterpretationSchema.superRefine((value, ctx) => {
    const used = new Set<number>();
    value.episodes.forEach((episode, episodeIdx) => {
      episode.blockIndices.forEach((blockIdx, indexIdx) => {
        const path = ["episodes", episodeIdx, "blockIndices", indexIdx];
        const block = blocks[blockIdx];

        if (block === undefined) {
          ctx.addIssue({
            code: ZodIssueCode.custom,
            path,
            message: `no block at index ${blockIdx}`,
          });
          return;
        }
        if (block.kind !== "activity") {
          ctx.addIssue({
            code: ZodIssueCode.custom,
            path,
            message: `block ${blockIdx} is "${block.kind}", not "activity" -- cannot be work`,
          });
        }
        if (used.has(blockIdx)) {
          ctx.addIssue({
            code: ZodIssueCode.custom,
            path,
            message: `block ${blockIdx} is already used by another episode`,
          });
        }
        used.add(blockIdx);
      });
    });
  });
}
