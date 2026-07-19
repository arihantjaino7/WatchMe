import type { SessionEvent } from "@watchme/shared";
import {
  DEFAULT_BLOCKLIST,
  idleEvent,
  transition,
  type RawTab,
  type TransitionCause,
} from "./filter";
import { enqueue, bufferedCount } from "./buffer";
import { getState, patchState } from "./state";
import { flush } from "./uploader";

/**
 * M1-E3-T1: translate Chrome's tab/window/idle events into the shared event
 * schema. Listeners MUST be registered at the service worker's top level
 * (Chrome re-binds them on every wake); all state is read fresh from
 * chrome.storage.session inside each handler.
 */

/** Flush early once this many events are waiting (timer alarm is the fallback). */
const FLUSH_THRESHOLD = 20;

async function emit(sessionId: string, events: SessionEvent[]): Promise<void> {
  for (const event of events) await enqueue(sessionId, event);
  if (events.length > 0 && (await bufferedCount()) >= FLUSH_THRESHOLD) {
    void flush();
  }
}

function toRawTab(tab: chrome.tabs.Tab): RawTab | null {
  if (tab.id === undefined || !tab.url) return null;
  return { tabId: tab.id, url: tab.url, title: tab.title ?? "", incognito: tab.incognito };
}

/** Apply one focus change through the privacy filter and persist the outcome. */
async function handleFocusChange(next: RawTab | null, cause: TransitionCause): Promise<void> {
  const state = await getState();
  if (!state.sessionId || state.paused) return;

  const result = transition({
    current: state.current,
    next,
    at: Date.now(),
    blocklist: DEFAULT_BLOCKLIST,
    cause,
  });
  await patchState({ current: result.context });
  await emit(state.sessionId, result.events);
}

/** Called when a session starts/resumes: seed context from the focused tab. */
export async function seedFromActiveTab(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  await handleFocusChange(tab ? toRawTab(tab) : null, "tab_switch");
}

/** Called on session end/pause: close out the current context. */
export async function closeCurrentContext(): Promise<void> {
  await handleFocusChange(null, "window_blur");
}

export function registerCaptureListeners(): void {
  chrome.tabs.onActivated.addListener((activeInfo) => {
    void (async () => {
      try {
        const tab = await chrome.tabs.get(activeInfo.tabId);
        await handleFocusChange(toRawTab(tab), "tab_switch");
      } catch {
        // Tab vanished between event and lookup.
      }
    })();
  });

  chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
    if (!tab.active || !changeInfo.url) return;
    void handleFocusChange(toRawTab(tab), "url_change");
  });

  chrome.windows.onFocusChanged.addListener((windowId) => {
    void (async () => {
      if (windowId === chrome.windows.WINDOW_ID_NONE) {
        await handleFocusChange(null, "window_blur");
        return;
      }
      const [tab] = await chrome.tabs.query({ active: true, windowId });
      await handleFocusChange(tab ? toRawTab(tab) : null, "window_focus");
    })();
  });

  chrome.idle.setDetectionInterval(60);
  chrome.idle.onStateChanged.addListener((idleState) => {
    void (async () => {
      const state = await getState();
      if (!state.sessionId || state.paused) return;

      const nowIdle = idleState !== "active";
      if (nowIdle === state.idle) return; // "idle" -> "locked" is not a new gap
      await patchState({ idle: nowIdle });
      await emit(state.sessionId, [idleEvent(nowIdle ? "idle_start" : "idle_end", Date.now())]);
    })();
  });
}
