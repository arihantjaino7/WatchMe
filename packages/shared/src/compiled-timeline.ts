import { z } from "zod";
import { CategorySchema } from "./domain-category";

/**
 * The deterministic output of the Session Compiler (Agent 0, ARCHITECTURE.md §8).
 *
 * This is the single source of truth for every session metric. The AI reflection
 * pipeline consumes these values and interprets them -- it never recomputes them.
 * Persisted denormalized into `sessions.stats` (jsonb); read back by the pipeline's
 * "load compiled timeline" step and, later, by the dashboard timeline.
 */

/** Bump when the compiler's output shape changes, so persisted stats can be migrated. */
export const COMPILER_VERSION = 1;

/** A contiguous segment of the compiled timeline. */
export const TimelineBlockKindSchema = z.enum(["activity", "idle", "redacted"]);
export type TimelineBlockKind = z.infer<typeof TimelineBlockKindSchema>;

export const TimelineBlockSchema = z.object({
  kind: TimelineBlockKindSchema,
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime(),
  durationMs: z.number().int().nonnegative(),
  /** Present only on `activity` blocks; `idle`/`redacted` carry no page context. */
  domain: z.string().nullable(),
  category: CategorySchema.nullable(),
  title: z.string().nullable(),
  /** True for an `activity` block on a single context lasting >= the focus threshold. */
  isFocus: z.boolean(),
});
export type TimelineBlock = z.infer<typeof TimelineBlockSchema>;

/** Per-domain time breakdown ("website usage summary"). */
export const DomainUsageSchema = z.object({
  domain: z.string(),
  category: CategorySchema,
  durationMs: z.number().int().nonnegative(),
  visits: z.number().int().nonnegative(),
});
export type DomainUsage = z.infer<typeof DomainUsageSchema>;

/**
 * Per-category time breakdown ("app usage summary"). In browser-only V1 the
 * closest analogue to an "app" is the activity category, so usage is rolled up
 * by category here and by domain in `websiteUsage`.
 */
export const CategoryUsageSchema = z.object({
  category: CategorySchema,
  durationMs: z.number().int().nonnegative(),
  percentage: z.number().min(0).max(100),
});
export type CategoryUsage = z.infer<typeof CategoryUsageSchema>;

export const CompiledTimelineSchema = z.object({
  compilerVersion: z.number().int().positive(),
  /** Wall-clock span of the session (endedAt - startedAt). */
  totalDurationMs: z.number().int().nonnegative(),
  /** Non-idle time attributed to activity blocks. */
  activeDurationMs: z.number().int().nonnegative(),
  /** Time spent inside focus blocks (single context >= the focus threshold). */
  focusDurationMs: z.number().int().nonnegative(),
  /** Time spent in idle gaps. */
  idleDurationMs: z.number().int().nonnegative(),
  /** focusDurationMs / activeDurationMs * 100, rounded; 0 when there is no active time. */
  focusPercentage: z.number().min(0).max(100),
  /** Distinct context switches after merging micro-switches. */
  contextSwitches: z.number().int().nonnegative(),
  longestFocusBlockMs: z.number().int().nonnegative(),
  appUsage: z.array(CategoryUsageSchema),
  websiteUsage: z.array(DomainUsageSchema),
  blocks: z.array(TimelineBlockSchema),
});
export type CompiledTimeline = z.infer<typeof CompiledTimelineSchema>;
