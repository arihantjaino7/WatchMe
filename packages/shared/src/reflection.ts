import { z } from "zod";

/**
 * The Reflection Analyst's structured output (Agent 2, ARCHITECTURE.md §8).
 *
 * Strict by construction: `.strict()` rejects any key the model invents, and every
 * free-text field is non-empty. The LLM abstraction validates raw model output
 * against this schema and retries on failure -- arbitrary free-form output can
 * never reach the database. Persisted as raw JSON in `reports.reflection`.
 */

/** Identifies the prompt+schema revision that produced a report, stored alongside it. */
export const REFLECTION_PROMPT_VERSION = "reflect-v1-2026-07-22";

export const ProductivityLabelSchema = z.enum(["high", "moderate", "low", "mixed"]);
export type ProductivityLabel = z.infer<typeof ProductivityLabelSchema>;

/** How the session measured up against the declared intent (or that there was none). */
export const IntentVerdictSchema = z.enum(["aligned", "partial", "diverged", "no_intent"]);
export type IntentVerdict = z.infer<typeof IntentVerdictSchema>;

const NonEmpty = z.string().min(1);

export const ReflectionSchema = z
  .object({
    /** 2-4 sentence factual account of how the session actually went. */
    narrative: NonEmpty,
    productivity: z.object({
      label: ProductivityLabelSchema,
      score: z.number().int().min(0).max(100),
      assessment: NonEmpty,
    }),
    distraction: z.object({
      summary: NonEmpty,
      /** Distracting domains, drawn only from the supplied evidence. */
      sources: z.array(z.string()).max(10),
    }),
    focus: z.object({
      /** The strongest focus period, described with reference to the evidence. */
      strongest: NonEmpty,
      /** The weakest / most fragmented period. */
      weakest: NonEmpty,
    }),
    intent: z.object({
      verdict: IntentVerdictSchema,
      assessment: NonEmpty,
    }),
    /** Work-pattern observations grounded in the metrics. */
    observations: z.array(NonEmpty).min(1).max(6),
    /** 1-3 concrete, specific, actionable suggestions. */
    suggestions: z.array(NonEmpty).min(1).max(3),
    /** Model's self-rated confidence given the amount of signal in the session. */
    confidence: z.number().min(0).max(1),
  })
  .strict();
export type Reflection = z.infer<typeof ReflectionSchema>;
