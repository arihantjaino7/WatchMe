import { describe, expect, it } from "vitest";
import { buildInterpretationMessages, INTERPRETATION_SYSTEM_PROMPT } from "./interpret-prompt";
import type { TimelineMetrics } from "./metrics";

function metrics(): TimelineMetrics {
  return {
    durations: {
      totalMinutes: 60,
      activeMinutes: 55,
      focusMinutes: 43,
      idleMinutes: 5,
      longestFocusMinutes: 30,
    },
    focusPercentage: 78,
    contextSwitches: 2,
    categories: [{ category: "coding", minutes: 48, percentage: 87 }],
    websites: [{ domain: "github.com", category: "coding", minutes: 48, visits: 3 }],
    timeline: [
      {
        index: 0,
        kind: "activity",
        atMinute: 0,
        durationMinutes: 30,
        domain: "github.com",
        category: "coding",
        title: "Issue",
        isFocus: true,
      },
    ],
    signal: "normal",
  };
}

describe("INTERPRETATION_SYSTEM_PROMPT", () => {
  it("states the core guardrails", () => {
    const p = INTERPRETATION_SYSTEM_PROMPT.toLowerCase();
    expect(p).toContain("only source of truth");
    expect(p).toContain("never invent");
    expect(p).toContain('"idle" or "redacted"');
    expect(p).toContain("disambiguate");
    expect(p).toContain("distraction");
    expect(p).toContain("do not calculate");
    expect(p).toContain("json");
  });
});

describe("buildInterpretationMessages", () => {
  it("returns a system + user pair with the metrics embedded", () => {
    const messages = buildInterpretationMessages(metrics(), "Ship the auth fix");
    const system = messages[0]!;
    const user = messages[1]!;

    expect(system.role).toBe("system");
    expect(system.content).toBe(INTERPRETATION_SYSTEM_PROMPT);

    expect(user.role).toBe("user");
    expect(user.content).toContain("Ship the auth fix");
    expect(user.content).toContain('"index": 0');
    expect(user.content).toContain("github.com");
  });

  it("marks a missing intent explicitly", () => {
    const user = buildInterpretationMessages(metrics(), null)[1]!;
    expect(user.content).toContain("(none declared)");
  });

  it("treats a blank intent as none declared", () => {
    const user = buildInterpretationMessages(metrics(), "   ")[1]!;
    expect(user.content).toContain("(none declared)");
  });
});
