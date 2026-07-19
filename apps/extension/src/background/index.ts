/**
 * MV3 service worker entry point.
 *
 * Lifecycle rule that governs everything here: this worker is killed and
 * restarted constantly. It holds NO state in module scope -- session state
 * lives in chrome.storage.session, the event buffer in IndexedDB, auth in
 * chrome.storage.local -- and every wake-up reconciles with the server
 * (M1-E3-T5). Listeners are registered synchronously at the top level, as
 * Chrome requires.
 */

import { clearAuth, connectWithCode, getStoredAuth } from "../lib/auth";
import { registerCaptureListeners } from "./capture";
import { endSession, reconcile, setPaused, startSession } from "./sessions";
import { getState } from "./state";
import { flush } from "./uploader";

export type PopupRequest =
  | { type: "getState" }
  | { type: "connect"; code: string }
  | { type: "disconnect" }
  | { type: "startSession"; intent: string | null }
  | { type: "endSession" }
  | { type: "setPaused"; paused: boolean };

export type PopupState = {
  connected: boolean;
  sessionId: string | null;
  startedAt: string | null;
  paused: boolean;
};

export type PopupResponse = { ok: true; state: PopupState } | { ok: false; error: string };

async function snapshot(): Promise<PopupState> {
  const [auth, state] = await Promise.all([getStoredAuth(), getState()]);
  return {
    connected: auth !== null,
    sessionId: state.sessionId,
    startedAt: state.startedAt,
    paused: state.paused,
  };
}

async function handle(request: PopupRequest): Promise<PopupResponse> {
  try {
    switch (request.type) {
      case "getState":
        await reconcile();
        break;
      case "connect":
        await connectWithCode(request.code);
        await reconcile();
        break;
      case "disconnect":
        await endSession().catch(() => {});
        await clearAuth();
        break;
      case "startSession":
        await startSession(request.intent);
        break;
      case "endSession":
        await endSession();
        break;
      case "setPaused":
        await setPaused(request.paused);
        break;
    }
    return { ok: true, state: await snapshot() };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong." };
  }
}

registerCaptureListeners();

chrome.runtime.onMessage.addListener((message: PopupRequest, _sender, sendResponse) => {
  void handle(message).then(sendResponse);
  return true; // keep the message channel open for the async response
});

const FLUSH_ALARM = "watchme-flush";

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === FLUSH_ALARM) void flush();
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(FLUSH_ALARM, { periodInMinutes: 1 });
});
chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create(FLUSH_ALARM, { periodInMinutes: 1 });
});

// Runs on EVERY worker wake (not just install/startup): restart recovery.
void reconcile();
