import { z } from "zod";
import { CompiledTimelineSchema } from "./compiled-timeline";

export const EndReasonSchema = z.enum(["user", "auto", "error"]);
export type EndReason = z.infer<typeof EndReasonSchema>;

export const AnalysisStatusSchema = z.enum(["pending", "running", "complete", "failed"]);
export type AnalysisStatus = z.infer<typeof AnalysisStatusSchema>;

/**
 * Denormalized compiler output (see ARCHITECTURE.md §11): the deterministic
 * `CompiledTimeline`, or null before the compiler has run. `stats` is
 * server-derived only -- the extension never sends it -- so tightening this from
 * the earlier loose placeholder is not a breaking change to the event contract.
 */
export const SessionStatsSchema = CompiledTimelineSchema.nullable();

export const SessionSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  intent: z.string().max(500).nullable(),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime().nullable(),
  endReason: EndReasonSchema.nullable(),
  analysisStatus: AnalysisStatusSchema,
  stats: SessionStatsSchema,
});
export type Session = z.infer<typeof SessionSchema>;

export const StartSessionRequestSchema = z.object({
  intent: z.string().max(500).optional(),
});
export type StartSessionRequest = z.infer<typeof StartSessionRequestSchema>;

export const StartSessionResponseSchema = z.object({
  session: SessionSchema,
  /** true when an already-active session was returned instead of a new one. */
  reused: z.boolean(),
});
export type StartSessionResponse = z.infer<typeof StartSessionResponseSchema>;

export const ActiveSessionResponseSchema = z.object({
  session: SessionSchema.nullable(),
});
export type ActiveSessionResponse = z.infer<typeof ActiveSessionResponseSchema>;

/** Returned by POST /sessions/:id/end -- also for the no-op "already ended" case. */
export const EndSessionResponseSchema = z.object({
  session: SessionSchema,
});
export type EndSessionResponse = z.infer<typeof EndSessionResponseSchema>;
