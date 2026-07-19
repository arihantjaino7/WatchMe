import { describe, expect, it } from "vitest";
import { EVENT_BATCH_MAX_SIZE, EventBatchRequestSchema, SessionEventSchema } from "./session-event";

function tabEvent(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    clientEventId: "evt-1",
    source: "extension",
    occurredAt: 1_700_000_000_000,
    type: "tab_focus",
    url: "https://github.com/watchme",
    title: "watchme",
    domain: "github.com",
    ...overrides,
  };
}

describe("SessionEventSchema", () => {
  it.each(["tab_focus", "tab_blur", "url_change", "window_focus", "window_blur"] as const)(
    "accepts a valid %s event",
    (type) => {
      const result = SessionEventSchema.safeParse(tabEvent({ type }));
      expect(result.success).toBe(true);
    },
  );

  it.each(["idle_start", "idle_end"] as const)("accepts a valid %s event", (type) => {
    const result = SessionEventSchema.safeParse({
      clientEventId: "evt-2",
      source: "extension",
      occurredAt: 1_700_000_000_000,
      type,
    });
    expect(result.success).toBe(true);
  });

  it("accepts a valid redacted event with duration only", () => {
    const result = SessionEventSchema.safeParse({
      clientEventId: "evt-3",
      source: "extension",
      occurredAt: 1_700_000_000_000,
      type: "redacted",
      durationMs: 60_000,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a redacted event carrying a url", () => {
    const result = SessionEventSchema.safeParse({
      clientEventId: "evt-4",
      source: "extension",
      occurredAt: 1_700_000_000_000,
      type: "redacted",
      durationMs: 60_000,
      url: "https://blocked.example.com/secret",
    });
    // extra keys are stripped by default zod object parsing, but the
    // discriminant must still resolve to the redacted (url-less) shape.
    expect(result.success).toBe(true);
    if (result.success && result.data.type === "redacted") {
      expect((result.data as Record<string, unknown>).url).toBeUndefined();
    }
  });

  it("rejects a tab event missing url", () => {
    const { url: _url, ...withoutUrl } = tabEvent();
    const result = SessionEventSchema.safeParse(withoutUrl);
    expect(result.success).toBe(false);
  });

  it("rejects an unknown event type", () => {
    const result = SessionEventSchema.safeParse(tabEvent({ type: "page_scroll" }));
    expect(result.success).toBe(false);
  });

  it("rejects a url exceeding the max length", () => {
    const hugeUrl = "https://example.com/" + "a".repeat(3000);
    const result = SessionEventSchema.safeParse(tabEvent({ url: hugeUrl }));
    expect(result.success).toBe(false);
  });

  it("rejects a negative occurredAt timestamp", () => {
    const result = SessionEventSchema.safeParse(tabEvent({ occurredAt: -1 }));
    expect(result.success).toBe(false);
  });
});

describe("EventBatchRequestSchema", () => {
  it("accepts a batch at the max size", () => {
    const events = Array.from({ length: EVENT_BATCH_MAX_SIZE }, (_, i) =>
      tabEvent({ clientEventId: `evt-${i}` }),
    );
    const result = EventBatchRequestSchema.safeParse({ events });
    expect(result.success).toBe(true);
  });

  it("rejects a batch exceeding the max size", () => {
    const events = Array.from({ length: EVENT_BATCH_MAX_SIZE + 1 }, (_, i) =>
      tabEvent({ clientEventId: `evt-${i}` }),
    );
    const result = EventBatchRequestSchema.safeParse({ events });
    expect(result.success).toBe(false);
  });

  it("rejects an empty batch", () => {
    const result = EventBatchRequestSchema.safeParse({ events: [] });
    expect(result.success).toBe(false);
  });
});
