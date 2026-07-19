import "./style.css";
import type { PopupRequest, PopupResponse, PopupState } from "../background";
import { API_BASE_URL } from "../lib/config";

/**
 * M1-E4: popup UI, three states per docs/ROADMAP.md:
 *  - logged-out -> "Connect" (M1-E1-T1 code exchange)
 *  - logged-in idle -> intent field + "Start session"
 *  - active -> elapsed time, "End session", pause-capture toggle
 *
 * The popup holds no session logic itself -- every action is a message to the
 * service worker (the only place chrome.storage.session/IndexedDB live) and
 * the response snapshot is what gets rendered.
 */

const app = document.getElementById("app")!;

function send(request: PopupRequest): Promise<PopupResponse> {
  return chrome.runtime.sendMessage(request);
}

function header(right: string): string {
  return `
    <div class="wm-head">
      <span class="wm-wordmark">WatchMe<span class="dot">.</span></span>
      ${right}
    </div>`;
}

function formatElapsed(startedAt: string): string {
  const ms = Date.now() - new Date(startedAt).getTime();
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

let elapsedTimer: ReturnType<typeof setInterval> | undefined;

function renderDisconnected(error?: string): void {
  app.innerHTML = `
    ${header('<span class="wm-badge">Not connected</span>')}
    <div class="wm-card">
      <p class="wm-lead">Connect this extension to your WatchMe account with the code shown at
        <strong>watchme-web.vercel.app/connect-extension</strong>.</p>
      <input class="wm-input wm-code-input" id="code" placeholder="XXXX-XXXX" maxlength="9" />
      <button class="wm-btn" id="connect-btn">Connect</button>
      ${error ? `<p class="wm-error">${error}</p>` : ""}
    </div>
    <p class="wm-footnote">Nothing is recorded until you start a session.
      <button class="wm-link-btn" id="open-connect">Open connect page</button></p>`;

  document.getElementById("open-connect")?.addEventListener("click", () => {
    void chrome.tabs.create({ url: `${API_BASE_URL}/connect-extension` });
  });

  const codeInput = document.getElementById("code") as HTMLInputElement;
  const connectBtn = document.getElementById("connect-btn") as HTMLButtonElement;
  connectBtn.addEventListener("click", () => {
    void (async () => {
      const code = codeInput.value.trim();
      if (!code) return;
      connectBtn.disabled = true;
      connectBtn.textContent = "Connecting…";
      const res = await send({ type: "connect", code });
      render(res);
    })();
  });
}

function renderIdle(): void {
  app.innerHTML = `
    ${header('<span class="wm-badge">Connected</span>')}
    <div class="wm-card">
      <p class="wm-lead">What are you about to work on?</p>
      <input class="wm-input" id="intent" placeholder="Intent (optional)" maxlength="500" />
      <button class="wm-btn" id="start-btn">Start session</button>
    </div>
    <p class="wm-footnote">
      <button class="wm-link-btn" id="disconnect-btn">Disconnect extension</button>
    </p>`;

  const intentInput = document.getElementById("intent") as HTMLInputElement;
  document.getElementById("start-btn")!.addEventListener("click", () => {
    void (async () => {
      const res = await send({ type: "startSession", intent: intentInput.value.trim() || null });
      render(res);
    })();
  });
  document.getElementById("disconnect-btn")!.addEventListener("click", () => {
    void send({ type: "disconnect" }).then(render);
  });
}

function renderActive(state: PopupState): void {
  clearInterval(elapsedTimer);
  const startedAt = state.startedAt!;

  app.innerHTML = `
    ${header(`<span class="wm-badge wm-badge--live">${state.paused ? "Paused" : "Recording"}</span>`)}
    <div class="wm-card">
      <div class="wm-elapsed" id="elapsed">${formatElapsed(startedAt)}</div>
      <button class="wm-btn wm-btn--ghost" id="pause-btn">${state.paused ? "Resume capture" : "Pause capture"}</button>
      <button class="wm-btn" id="end-btn">End session</button>
    </div>`;

  elapsedTimer = setInterval(() => {
    const el = document.getElementById("elapsed");
    if (el) el.textContent = formatElapsed(startedAt);
  }, 1000);

  document.getElementById("pause-btn")!.addEventListener("click", () => {
    void send({ type: "setPaused", paused: !state.paused }).then(render);
  });
  document.getElementById("end-btn")!.addEventListener("click", (event) => {
    const button = event.currentTarget as HTMLButtonElement;
    button.disabled = true;
    button.textContent = "Ending…";
    void send({ type: "endSession" }).then(render);
  });
}

function render(response: PopupResponse): void {
  clearInterval(elapsedTimer);
  if (!response.ok) {
    renderDisconnected(response.error);
    return;
  }
  const { state } = response;
  if (!state.connected) renderDisconnected();
  else if (state.sessionId) renderActive(state);
  else renderIdle();
}

void send({ type: "getState" }).then(render);
