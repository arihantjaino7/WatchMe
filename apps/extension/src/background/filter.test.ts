import { describe, expect, it } from "vitest";
import { DEFAULT_BLOCKLIST, isBlocklisted, stripUrl, transition } from "./filter";

describe("stripUrl (M1-E3-T2)", () => {
  it("keeps only origin + pathname", () => {
    const result = stripUrl("https://example.com/path/page?token=secret&q=search#frag");
    expect(result).toEqual({ url: "https://example.com/path/page", domain: "example.com" });
  });

  it("rejects non-http(s) schemes", () => {
    expect(stripUrl("chrome://extensions")).toBeNull();
    expect(stripUrl("about:blank")).toBeNull();
    expect(stripUrl("not a url")).toBeNull();
  });
});

describe("isBlocklisted", () => {
  it("matches exact domains and subdomains, not lookalikes", () => {
    expect(isBlocklisted("chase.com", ["chase.com"])).toBe(true);
    expect(isBlocklisted("mobile.chase.com", ["chase.com"])).toBe(true);
    expect(isBlocklisted("notchase.com", ["chase.com"])).toBe(false);
    expect(isBlocklisted("chase.com.evil.com", ["chase.com"])).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(isBlocklisted("Chase.COM", ["chase.com"])).toBe(true);
  });
});

describe("transition (M1-E3-T2 AC: blocklisted domain never carries url/title)", () => {
  const blocklist = ["chase.com"];

  it("a blocklisted domain never appears with url/title populated -- only redacted", () => {
    const { events, context } = transition({
      current: null,
      next: { tabId: 1, url: "https://chase.com/accounts", title: "My Bank", incognito: false },
      at: 1000,
      blocklist,
      cause: "tab_switch",
    });

    // Focusing a blocklisted tab emits nothing yet (redaction happens on blur,
    // once a duration exists) -- but the context must carry no identity.
    expect(events).toEqual([]);
    expect(context).toMatchObject({ redacted: true, url: "", title: "", domain: "" });
  });

  it("blurring away from a blocklisted tab emits exactly one redacted duration event", () => {
    const seeded = transition({
      current: null,
      next: { tabId: 1, url: "https://chase.com/accounts", title: "My Bank", incognito: false },
      at: 1000,
      blocklist,
      cause: "tab_switch",
    });

    const { events, context } = transition({
      current: seeded.context,
      next: { tabId: 2, url: "https://docs.example.com", title: "Docs", incognito: false },
      at: 6000,
      blocklist,
      cause: "tab_switch",
    });

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ type: "redacted", durationMs: 5000 });
    expect(events[0]).not.toHaveProperty("url");
    expect(events[0]).not.toHaveProperty("title");
    expect(events[0]).not.toHaveProperty("domain");
    expect(events[1]).toMatchObject({ type: "tab_focus", domain: "docs.example.com" });
    expect(context).toMatchObject({ redacted: false, domain: "docs.example.com" });
  });

  it("incognito tab activity produces zero events and a null context", () => {
    const { events, context } = transition({
      current: null,
      next: { tabId: 1, url: "https://example.com", title: "Example", incognito: true },
      at: 1000,
      blocklist,
      cause: "tab_switch",
    });
    expect(events).toEqual([]);
    expect(context).toBeNull();
  });

  it("blurring away from incognito emits nothing (there was no context to close)", () => {
    const { events } = transition({
      current: null,
      next: null,
      at: 2000,
      blocklist,
      cause: "window_blur",
    });
    expect(events).toEqual([]);
  });

  it("ordinary tab switch emits blur then focus with full page context", () => {
    const first = transition({
      current: null,
      next: { tabId: 1, url: "https://a.com/one", title: "A", incognito: false },
      at: 1000,
      blocklist,
      cause: "tab_switch",
    });
    const second = transition({
      current: first.context,
      next: { tabId: 2, url: "https://b.com/two", title: "B", incognito: false },
      at: 2000,
      blocklist,
      cause: "tab_switch",
    });

    expect(second.events.map((e) => e.type)).toEqual(["tab_blur", "tab_focus"]);
    expect(second.events[0]).toMatchObject({ url: "https://a.com/one", domain: "a.com" });
    expect(second.events[1]).toMatchObject({ url: "https://b.com/two", domain: "b.com" });
  });

  it("same-tab navigation collapses to one url_change, not blur+focus", () => {
    const first = transition({
      current: null,
      next: { tabId: 1, url: "https://a.com/one", title: "A1", incognito: false },
      at: 1000,
      blocklist,
      cause: "tab_switch",
    });
    const { events, context } = transition({
      current: first.context,
      next: { tabId: 1, url: "https://a.com/two", title: "A2", incognito: false },
      at: 1500,
      blocklist,
      cause: "url_change",
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "url_change", url: "https://a.com/two" });
    expect(context).toMatchObject({ url: "https://a.com/two" });
  });

  it("identical url_change (no-op navigation callback) emits nothing", () => {
    const first = transition({
      current: null,
      next: { tabId: 1, url: "https://a.com/one", title: "A1", incognito: false },
      at: 1000,
      blocklist,
      cause: "tab_switch",
    });
    const { events, context } = transition({
      current: first.context,
      next: { tabId: 1, url: "https://a.com/one", title: "A1", incognito: false },
      at: 1200,
      blocklist,
      cause: "url_change",
    });
    expect(events).toEqual([]);
    expect(context).toBe(first.context);
  });
});

describe("DEFAULT_BLOCKLIST", () => {
  it("is non-empty and lowercase-normalized domains", () => {
    expect(DEFAULT_BLOCKLIST.length).toBeGreaterThan(0);
    for (const domain of DEFAULT_BLOCKLIST) {
      expect(domain).toBe(domain.toLowerCase());
    }
  });
});
