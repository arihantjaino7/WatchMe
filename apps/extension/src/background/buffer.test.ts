import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import indexedDB from "fake-indexeddb";
import type { SessionEvent } from "@watchme/shared";
import { bufferedCount, enqueue, removeEvents, takeBatch } from "./buffer";

function tabEvent(clientEventId: string, occurredAt: number): SessionEvent {
  return {
    clientEventId,
    source: "extension",
    occurredAt,
    type: "tab_focus",
    url: "https://example.com/",
    title: "Example",
    domain: "example.com",
  };
}

beforeEach(() => {
  // Fresh database per test -- delete and let the next open recreate it.
  indexedDB.deleteDatabase("watchme-buffer");
});

describe("IndexedDB buffer (M1-E3-T3)", () => {
  it("buffering the same logical event twice still uploads with one stable clientEventId", async () => {
    const id = "stable-id-1";
    await enqueue("session-1", tabEvent(id, 1000));
    await enqueue("session-1", tabEvent(id, 1000)); // simulated retry of the same observation

    expect(await bufferedCount()).toBe(1);
    const batch = await takeBatch(10);
    expect(batch).toHaveLength(1);
    expect(batch[0]!.clientEventId).toBe(id);
  });

  it("takeBatch drains in insertion (enqueue) order and respects the limit", async () => {
    // Sort key is enqueuedAt (real insertion time), not the event's own
    // occurredAt -- that's what gives the uploader a stable FIFO drain even
    // if events arrive with out-of-order timestamps.
    await enqueue("s1", tabEvent("a", 3000));
    await enqueue("s1", tabEvent("b", 1000));
    await enqueue("s1", tabEvent("c", 2000));

    const batch = await takeBatch(2);
    expect(batch.map((b) => b.clientEventId)).toEqual(["a", "b"]);
  });

  it("removeEvents deletes only the given ids", async () => {
    await enqueue("s1", tabEvent("keep", 1000));
    await enqueue("s1", tabEvent("drop", 2000));

    await removeEvents(["drop"]);

    expect(await bufferedCount()).toBe(1);
    const remaining = await takeBatch(10);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.clientEventId).toBe("keep");
  });
});
