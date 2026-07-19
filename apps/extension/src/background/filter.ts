import type { SessionEvent } from "@watchme/shared";

/**
 * M1-E3-T2: the local privacy filter. Everything here is a pure function of
 * its inputs so the trust-critical rules are unit-testable without Chrome:
 *
 *  1. URLs are stripped to origin+path BEFORE they exist anywhere -- query
 *     strings and fragments (tokens, search terms) never touch the buffer.
 *  2. A blocklisted domain never yields url/title/domain. Its entire focus
 *     span collapses into one `{type:'redacted', durationMs}` event.
 *  3. Incognito tabs produce zero events, not even redacted ones.
 */

/** What the capture layer knows about the currently-focused page. */
export type FocusContext = {
  tabId: number;
  /** Already stripped; NEVER a raw tab URL. Empty when redacted. */
  url: string;
  title: string;
  domain: string;
  /** Epoch ms when this context gained focus. */
  since: number;
  redacted: boolean;
};

/** Raw observation from a chrome.tabs.Tab -- untrusted, unstripped. */
export type RawTab = {
  tabId: number;
  url: string;
  title: string;
  incognito: boolean;
};

export type TransitionCause = "tab_switch" | "url_change" | "window_focus" | "window_blur";

/** origin + pathname only. Returns null for non-web schemes (chrome://, about:, …). */
export function stripUrl(raw: string): { url: string; domain: string } | null {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  return { url: `${parsed.origin}${parsed.pathname}`, domain: parsed.hostname };
}

/** Exact match or subdomain of a blocklist entry. */
export function isBlocklisted(domain: string, blocklist: readonly string[]): boolean {
  const needle = domain.toLowerCase();
  return blocklist.some((entry) => {
    const e = entry.toLowerCase();
    return needle === e || needle.endsWith(`.${e}`);
  });
}

function newClientEventId(): string {
  return crypto.randomUUID();
}

function pageEvent(
  type: "tab_focus" | "tab_blur" | "url_change" | "window_focus" | "window_blur",
  ctx: FocusContext,
  at: number,
): SessionEvent {
  return {
    clientEventId: newClientEventId(),
    source: "extension",
    occurredAt: at,
    type,
    url: ctx.url,
    title: ctx.title,
    domain: ctx.domain,
  };
}

function redactedEvent(ctx: FocusContext, at: number): SessionEvent {
  return {
    clientEventId: newClientEventId(),
    source: "extension",
    occurredAt: at,
    type: "redacted",
    durationMs: Math.max(0, at - ctx.since),
  };
}

export function idleEvent(type: "idle_start" | "idle_end", at: number): SessionEvent {
  return { clientEventId: newClientEventId(), source: "extension", occurredAt: at, type };
}

/**
 * The single choke point every focus change goes through. Given the current
 * context and a newly-observed tab (or null when focus is lost), returns the
 * events to emit and the next context. All privacy rules live HERE.
 */
export function transition(args: {
  current: FocusContext | null;
  next: RawTab | null;
  at: number;
  blocklist: readonly string[];
  cause: TransitionCause;
}): { events: SessionEvent[]; context: FocusContext | null } {
  const { current, next, at, blocklist, cause } = args;
  const events: SessionEvent[] = [];

  const nextContext = toContext(next, at, blocklist);

  // Same-tab navigation between two visible pages is one url_change, not a
  // blur/focus pair.
  if (
    cause === "url_change" &&
    current &&
    nextContext &&
    current.tabId === nextContext.tabId &&
    !current.redacted &&
    !nextContext.redacted
  ) {
    if (current.url === nextContext.url && current.title === nextContext.title) {
      return { events, context: current };
    }
    events.push(pageEvent("url_change", nextContext, at));
    return { events, context: nextContext };
  }

  if (current) {
    if (current.redacted) {
      events.push(redactedEvent(current, at));
    } else {
      events.push(pageEvent(cause === "window_blur" ? "window_blur" : "tab_blur", current, at));
    }
  }

  if (nextContext && !nextContext.redacted) {
    events.push(
      pageEvent(cause === "window_focus" ? "window_focus" : "tab_focus", nextContext, at),
    );
  }

  return { events, context: nextContext };
}

/** Incognito and non-web tabs yield NO context: nothing to record, ever. */
function toContext(
  raw: RawTab | null,
  at: number,
  blocklist: readonly string[],
): FocusContext | null {
  if (!raw || raw.incognito) return null;
  const stripped = stripUrl(raw.url);
  if (!stripped) return null;

  if (isBlocklisted(stripped.domain, blocklist)) {
    // Redacted context carries no page identity at all -- only the clock.
    return { tabId: raw.tabId, url: "", title: "", domain: "", since: at, redacted: true };
  }
  return {
    tabId: raw.tabId,
    url: stripped.url,
    title: raw.title.slice(0, 512),
    domain: stripped.domain,
    since: at,
    redacted: false,
  };
}

/**
 * V1 default blocklist: obviously-sensitive categories. User-editable
 * blocklist arrives with M4's settings page; until then this is the floor.
 */
export const DEFAULT_BLOCKLIST: readonly string[] = [
  "accounts.google.com",
  "myaccount.google.com",
  "passwords.google.com",
  "chase.com",
  "bankofamerica.com",
  "wellsfargo.com",
  "hdfcbank.com",
  "icicibank.com",
  "onlinesbi.sbi",
  "paypal.com",
  "healthcare.gov",
  "myhealth.va.gov",
];
