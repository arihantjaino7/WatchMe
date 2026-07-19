import { ActiveSessionResponseSchema, StartSessionResponseSchema } from "@watchme/shared";
import { apiFetch, getStoredAuth, NotConnectedError } from "../lib/auth";
import { closeCurrentContext, seedFromActiveTab } from "./capture";
import { EMPTY_STATE, getState, patchState, setState } from "./state";
import { flush } from "./uploader";

/** Session lifecycle as seen from the extension (M1-E2 endpoints). */

export async function startSession(intent: string | null): Promise<void> {
  const res = await apiFetch("/api/v1/sessions", {
    method: "POST",
    body: JSON.stringify(intent ? { intent } : {}),
  });
  if (!res.ok) throw new Error("Could not start the session.");
  const { session } = StartSessionResponseSchema.parse(await res.json());

  await patchState({
    sessionId: session.id,
    startedAt: session.startedAt,
    paused: false,
    idle: false,
    current: null,
  });
  await seedFromActiveTab();
}

export async function endSession(): Promise<void> {
  const state = await getState();
  if (!state.sessionId) return;

  // Final blur/redacted event, then drain the buffer BEFORE ending so the
  // session's last_event_at reflects reality (M1-E4-T3 AC).
  await closeCurrentContext();
  await flush();

  const res = await apiFetch(`/api/v1/sessions/${state.sessionId}/end`, { method: "POST" });
  if (!res.ok && res.status !== 404) throw new Error("Could not end the session.");

  await flush();
  await setState(EMPTY_STATE);
}

export async function setPaused(paused: boolean): Promise<void> {
  const state = await getState();
  if (!state.sessionId) return;

  if (paused) {
    await closeCurrentContext();
    await patchState({ paused: true });
  } else {
    await patchState({ paused: false });
    await seedFromActiveTab();
  }
}

/**
 * M1-E3-T5: reconcile stored state with the server on every service-worker
 * wake. The server is ground truth: a session ended elsewhere (dashboard,
 * auto-end job) clears local state; one started elsewhere is adopted.
 */
export async function reconcile(): Promise<void> {
  const auth = await getStoredAuth();
  if (!auth) return;

  try {
    const res = await apiFetch("/api/v1/sessions/active");
    if (!res.ok) return;
    const { session } = ActiveSessionResponseSchema.parse(await res.json());
    const state = await getState();

    if (session && state.sessionId !== session.id) {
      await patchState({
        sessionId: session.id,
        startedAt: session.startedAt,
        idle: false,
        current: null,
      });
    } else if (!session && state.sessionId) {
      await setState(EMPTY_STATE);
    }

    // Push anything the previous worker incarnation left behind.
    void flush();
  } catch (err) {
    if (err instanceof NotConnectedError) return;
    // Offline: stored state stands until we can reach the server.
  }
}
