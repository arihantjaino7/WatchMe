import type { FocusContext } from "./filter";

/**
 * M1-E3-T5: all capture state lives in chrome.storage.session -- it survives
 * service-worker termination (the constant MV3 hazard) but resets with the
 * browser, which is exactly the durability we want for "what am I focused on
 * right now". Ground truth for "is a session running" is always the server;
 * this is just the working copy.
 */

export type CaptureState = {
  sessionId: string | null;
  /** ISO timestamp; popup derives elapsed time from it. */
  startedAt: string | null;
  paused: boolean;
  current: FocusContext | null;
  idle: boolean;
};

const KEY = "watchme-capture-state";

export const EMPTY_STATE: CaptureState = {
  sessionId: null,
  startedAt: null,
  paused: false,
  current: null,
  idle: false,
};

export async function getState(): Promise<CaptureState> {
  const record = await chrome.storage.session.get(KEY);
  return { ...EMPTY_STATE, ...(record[KEY] as Partial<CaptureState> | undefined) };
}

export async function setState(state: CaptureState): Promise<void> {
  await chrome.storage.session.set({ [KEY]: state });
}

export async function patchState(patch: Partial<CaptureState>): Promise<CaptureState> {
  const next = { ...(await getState()), ...patch };
  await setState(next);
  return next;
}
