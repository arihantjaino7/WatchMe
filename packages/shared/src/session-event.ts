import { z } from "zod";

/**
 * The extension is the only source in V1; kept as an enum (not a literal)
 * because the desktop agent (V2.5, see ARCHITECTURE.md) joins with the same
 * event shape later -- this field is what lets timeline queries stay
 * source-agnostic without a schema change.
 */
export const EventSourceSchema = z.enum(["extension"]);

/** Non-negative epoch milliseconds. Extension clocks are untrusted but never negative. */
const TimestampSchema = z.number().int().nonnegative();

/**
 * URLs are stripped to origin+path before they ever reach this schema --
 * query strings can carry tokens/search terms. Capped well above any
 * realistic path length as a defense against a malformed/malicious client.
 */
const UrlSchema = z.string().url().max(2048);
const TitleSchema = z.string().max(512);
const DomainSchema = z.string().min(1).max(255);
const ClientEventIdSchema = z.string().min(1).max(128);

const EventBaseSchema = z.object({
  clientEventId: ClientEventIdSchema,
  source: EventSourceSchema,
  occurredAt: TimestampSchema,
});

/** Tab/window events: the only variants carrying URL/title/domain. */
const TabActivityEventSchema = EventBaseSchema.extend({
  type: z.enum(["tab_focus", "tab_blur", "url_change", "window_focus", "window_blur"]),
  url: UrlSchema,
  title: TitleSchema,
  domain: DomainSchema,
});

/** Idle transitions carry no page context, just the state change itself. */
const IdleEventSchema = EventBaseSchema.extend({
  type: z.enum(["idle_start", "idle_end"]),
});

/**
 * What a blocklisted domain becomes after the local privacy filter runs --
 * see ARCHITECTURE.md §17. Duration only; URL/title/domain never leave the
 * device for blocklisted activity, so this variant structurally cannot carry them.
 */
const RedactedEventSchema = EventBaseSchema.extend({
  type: z.literal("redacted"),
  durationMs: z.number().int().nonnegative(),
});

export const SessionEventSchema = z.discriminatedUnion("type", [
  TabActivityEventSchema,
  IdleEventSchema,
  RedactedEventSchema,
]);
export type SessionEvent = z.infer<typeof SessionEventSchema>;

export const EVENT_BATCH_MAX_SIZE = 100;

export const EventBatchRequestSchema = z.object({
  events: z.array(SessionEventSchema).min(1).max(EVENT_BATCH_MAX_SIZE),
});
export type EventBatchRequest = z.infer<typeof EventBatchRequestSchema>;

export const EventBatchResponseSchema = z.object({
  accepted: z.number().int().nonnegative(),
});
export type EventBatchResponse = z.infer<typeof EventBatchResponseSchema>;
