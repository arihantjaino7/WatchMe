import { EVENT_BATCH_MAX_SIZE } from "@watchme/shared";
import { apiFetch, NotConnectedError } from "../lib/auth";
import { removeEvents, takeBatch } from "./buffer";

/**
 * M1-E3-T4 (client half): drain the buffer in batches. Offline-safe by
 * construction -- events are deleted from IndexedDB only after the server
 * acknowledged the batch, and the server absorbs replays idempotently, so
 * "uploaded twice" is harmless and "deleted without upload" is impossible.
 */

let flushInFlight = false;

export async function flush(): Promise<void> {
  if (flushInFlight) return;
  flushInFlight = true;
  try {
    // Keep draining until the buffer is empty or something fails.
    for (;;) {
      const batch = await takeBatch(EVENT_BATCH_MAX_SIZE);
      if (batch.length === 0) return;

      // One upload per session (batches can straddle a session end).
      const bySession = new Map<string, typeof batch>();
      for (const item of batch) {
        const group = bySession.get(item.sessionId) ?? [];
        group.push(item);
        bySession.set(item.sessionId, group);
      }

      for (const [sessionId, items] of bySession) {
        const res = await apiFetch(`/api/v1/sessions/${sessionId}/events`, {
          method: "POST",
          body: JSON.stringify({ events: items.map((i) => i.event) }),
        });

        if (res.ok) {
          await removeEvents(items.map((i) => i.clientEventId));
        } else if (res.status === 404) {
          // Session no longer exists server-side; retrying forever would wedge
          // the buffer. Drop these events.
          await removeEvents(items.map((i) => i.clientEventId));
        } else {
          // Server trouble: leave the buffer intact for the next flush.
          return;
        }
      }
    }
  } catch (err) {
    // Offline or disconnected: both mean "keep buffering, flush later".
    if (!(err instanceof NotConnectedError)) {
      // Network errors are expected mid-session (laptop lid, wifi switch).
    }
  } finally {
    flushInFlight = false;
  }
}
