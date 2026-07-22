import { describe, expect, it } from "vitest";
import { buildReflectionMessages, REFLECTION_SYSTEM_PROMPT } from "./prompt";
import type { ReflectionMetrics } from "./metrics";

function metrics(): ReflectionMetrics {
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

describe("REFLECTION_SYSTEM_PROMPT", () => {
  it("states the core guardrails", () => {
    const p = REFLECTION_SYSTEM_PROMPT.toLowerCase();
    expect(p).toContain("only source of truth");
    expect(p).toContain("never invent");
    expect(p).toContain("interpret");
    expect(p).toContain("no_intent");
    expect(p).toContain("json");
    expect(p).toContain("1 to 3 suggestions");
  });
});

describe("buildReflectionMessages", () => {
  it("returns a system + user pair with the metrics embedded", () => {
    const messages = buildReflectionMessages(metrics(), "Ship the auth fix");
    const system = messages[0]!;
    const user = messages[1]!;

    expect(system.role).toBe("system");
    expect(system.content).toBe(REFLECTION_SYSTEM_PROMPT);

    expect(user.role).toBe("user");
    expect(user.content).toContain("Ship the auth fix");
    // Deterministic values are passed through verbatim for the model to interpret.
    expect(user.content).toContain('"focusPercentage": 78');
    expect(user.content).toContain("github.com");
    expect(user.content).toContain('"contextSwitches": 2');
  });

  it("marks a missing intent explicitly", () => {
    const user = buildReflectionMessages(metrics(), null)[1]!;
    expect(user.content).toContain("(none declared)");
  });

  it("treats a blank intent as none declared", () => {
    const user = buildReflectionMessages(metrics(), "   ")[1]!;
    expect(user.content).toContain("(none declared)");
  });
});
