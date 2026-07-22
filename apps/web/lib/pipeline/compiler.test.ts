import { describe, expect, it } from "vitest";
import { compile, type CompilerInputEvent } from "./compiler";

const T0 = 1_700_000_000_000;
const MIN = 60_000;
const at = (min: number, sec = 0) => T0 + min * MIN + sec * 1_000;

/**
 * Golden fixture — one hand-verified session. Exercises: url_change coalescing
 * within a domain, a sub-5s micro-switch fold (youtube), an idle gap with
 * context resume, a redacted (blocklisted) span, focus-block detection, and
 * per-domain / per-category usage. The expected numbers below are computed by
 * hand from this event stream; see comments.
 */
function goldenEvents(): CompilerInputEvent[] {
  return [
    { type: "tab_focus", occurredAt: at(0), domain: "github.com", title: "Issue" },
    { type: "url_change", occurredAt: at(15), domain: "github.com", title: "Issue comments" },
    { type: "tab_focus", occurredAt: at(20), domain: "youtube.com", title: "Debug video" },
    { type: "tab_focus", occurredAt: at(20, 2), domain: "github.com", title: "Issue" }, // 2s micro
    { type: "idle_start", occurredAt: at(30) },
    { type: "idle_end", occurredAt: at(35) },
    { type: "tab_focus", occurredAt: at(35), domain: "github.com", title: "Issue" }, // resume noise
    { type: "tab_focus", occurredAt: at(40), domain: "reddit.com", title: "r/programming" },
    { type: "tab_blur", occurredAt: at(42), domain: "reddit.com", title: "r/programming" },
    { type: "redacted", occurredAt: at(47), durationMs: 5 * MIN }, // blocklisted span [42,47]
    { type: "tab_focus", occurredAt: at(47), domain: "github.com", title: "Issue" },
  ];
}

describe("compile", () => {
  it("produces the hand-verified metrics for the golden session", () => {
    const timeline = compile(goldenEvents(), { startedAtMs: at(0), endedAtMs: at(60) });

    // Blocks after coalescing + micro-switch fold:
    // github[0,30] focus, idle[30,35], github[35,40], reddit[40,42], redacted[42,47], github[47,60] focus
    expect(timeline.blocks).toHaveLength(6);
    expect(timeline.blocks.map((b) => b.kind)).toEqual([
      "activity",
      "idle",
      "activity",
      "activity",
      "redacted",
      "activity",
    ]);
    expect(timeline.blocks.filter((b) => b.isFocus)).toHaveLength(2);

    expect(timeline.totalDurationMs).toBe(60 * MIN);
    // activity = 30+5+2+13 = 50min; redacted = 5min; active = 55min
    expect(timeline.activeDurationMs).toBe(55 * MIN);
    expect(timeline.idleDurationMs).toBe(5 * MIN);
    // focus = github[0,30] (30) + github[47,60] (13) = 43min
    expect(timeline.focusDurationMs).toBe(43 * MIN);
    expect(timeline.longestFocusBlockMs).toBe(30 * MIN);
    // round(43/55 * 100) = 78
    expect(timeline.focusPercentage).toBe(78);
    // activity order: github, github, reddit, github -> 2 switches
    expect(timeline.contextSwitches).toBe(2);
  });

  it("aggregates per-domain and per-category usage (redacted excluded)", () => {
    const timeline = compile(goldenEvents(), { startedAtMs: at(0), endedAtMs: at(60) });

    // github visited as 3 separate activity blocks (youtube micro-switch folded away)
    expect(timeline.websiteUsage).toEqual([
      { domain: "github.com", category: "coding", durationMs: 48 * MIN, visits: 3 },
      { domain: "reddit.com", category: "entertainment", durationMs: 2 * MIN, visits: 1 },
    ]);
    expect(timeline.appUsage[0]).toMatchObject({ category: "coding", durationMs: 48 * MIN });
    expect(timeline.appUsage.map((u) => u.category)).toEqual(["coding", "entertainment"]);
  });

  it("returns an all-zero timeline for a session with no events", () => {
    const timeline = compile([], { startedAtMs: at(0), endedAtMs: at(30) });
    expect(timeline.totalDurationMs).toBe(30 * MIN);
    expect(timeline.activeDurationMs).toBe(0);
    expect(timeline.focusDurationMs).toBe(0);
    expect(timeline.contextSwitches).toBe(0);
    expect(timeline.blocks).toHaveLength(0);
    expect(timeline.websiteUsage).toHaveLength(0);
  });

  it("attributes an unbounded idle gap to session end", () => {
    const events: CompilerInputEvent[] = [
      { type: "tab_focus", occurredAt: at(0), domain: "github.com", title: "x" },
      { type: "idle_start", occurredAt: at(10) },
    ];
    const timeline = compile(events, { startedAtMs: at(0), endedAtMs: at(30) });
    expect(timeline.idleDurationMs).toBe(20 * MIN); // [10,30]
    expect(timeline.activeDurationMs).toBe(10 * MIN); // github [0,10]
  });
});
