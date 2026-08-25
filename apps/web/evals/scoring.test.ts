import { describe, expect, it } from "vitest";
import type { ActivityInterpretation, Reflection } from "@watchme/shared";
import { episode, interpretation, json, session } from "./cases/builder";
import { scoreInterpretation, type Agent1Outcome } from "./scoring/agent1";
import { scoreReflection, type Agent2Outcome } from "./scoring/agent2";
import type { EvalCase } from "./types";

// github[0,20] (idx0), reddit[20,40] (idx1) — both activity blocks.
const timeline = session(0)
  .focus(0, "github.com", "repo — watchme")
  .focus(20, "reddit.com", "r/programming")
  .compile(40);

// github[0,10] (idx0), idle[10,20] (idx1), github[20,30] (idx2).
const idleTimeline = session(0).focus(0, "github.com", "repo — watchme").idle(10, 20).compile(30);

function baseCase(over: Partial<EvalCase> = {}): EvalCase {
  return {
    id: "unit",
    name: "unit",
    scenario: "",
    intent: "do the work",
    timeline,
    interpretationOutput: "{}",
    reflectionOutput: "{}",
    expected: { interpretation: {}, reflection: {} },
    metadata: { author: "t", createdAt: "2026-07-22", tags: [] },
    ...over,
  };
}

const failed: Agent1Outcome = { ok: false, error: "invalid_output" };

describe("scoreInterpretation — grounding", () => {
  it("flags an invalid (out-of-range) block index", () => {
    const c = baseCase({
      interpretationOutput: json(
        interpretation([
          episode({ label: "Coding on the repo", category: "coding", blockIndices: [9] }),
        ]),
      ),
    });
    const card = scoreInterpretation(c, failed);
    const names = card.failures.map((f) => f.name);
    expect(names).toContain("grounding.no_invalid_index");
    expect(names).toContain("grounding.valid");
  });

  it("flags a duplicate block index reused across episodes", () => {
    const c = baseCase({
      interpretationOutput: json(
        interpretation([
          episode({ label: "First coding pass", category: "coding", blockIndices: [0] }),
          episode({ label: "Second coding pass", category: "coding", blockIndices: [0] }),
        ]),
      ),
    });
    const card = scoreInterpretation(c, failed);
    expect(card.failures.map((f) => f.name)).toContain("grounding.no_duplicate_index");
  });

  it("flags an episode citing a non-activity (idle) block", () => {
    const c = baseCase({
      timeline: idleTimeline,
      interpretationOutput: json(
        interpretation([
          episode({ label: "Coding on the repo", category: "coding", blockIndices: [1] }),
        ]),
      ),
    });
    const card = scoreInterpretation(c, failed);
    expect(card.failures.map((f) => f.name)).toContain("grounding.no_nonactivity");
  });
});

describe("scoreInterpretation — quality", () => {
  function validOutcome(interp: ActivityInterpretation): Agent1Outcome {
    return { ok: true, interpretation: interp };
  }

  it("flags a category that contradicts the cited blocks", () => {
    const interp = interpretation([
      episode({ label: "Reading the documentation", category: "docs", blockIndices: [0] }),
    ]);
    const c = baseCase({ interpretationOutput: json(interp) });
    const card = scoreInterpretation(c, validOutcome(interp));
    expect(card.failures.map((f) => f.name)).toContain("category.accuracy");
  });

  it("fails when a required distraction domain is not flagged", () => {
    const interp = interpretation([
      episode({ label: "Coding on the repo", category: "coding", blockIndices: [0] }),
      episode({ label: "Browsing reddit", category: "entertainment", blockIndices: [1] }),
    ]);
    const c = baseCase({
      interpretationOutput: json(interp),
      expected: { interpretation: { requiredDistractionDomains: ["reddit.com"] }, reflection: {} },
    });
    const card = scoreInterpretation(c, validOutcome(interp));
    expect(card.failures.map((f) => f.name)).toContain("distraction.detected");
  });

  it("passes a clean, well-grouped interpretation", () => {
    const interp = interpretation([
      episode({ label: "Coding on the watchme repo", category: "coding", blockIndices: [0] }),
      episode({
        label: "Browsing r/programming",
        category: "entertainment",
        blockIndices: [1],
        isDistraction: true,
        relevanceToIntent: "unrelated",
      }),
    ]);
    const c = baseCase({ interpretationOutput: json(interp) });
    const card = scoreInterpretation(c, validOutcome(interp));
    expect(card.failures).toHaveLength(0);
    expect(card.score).toBe(1);
  });
});

function baseReflection(over: Partial<Reflection> = {}): Reflection {
  return {
    narrative: "You spent the session on github.com with a short reddit.com detour.",
    productivity: { label: "high", score: 80, assessment: "Focused coding on github.com." },
    distraction: { summary: "One reddit.com detour.", sources: ["reddit.com"] },
    focus: { strongest: "A long github.com block", weakest: "The reddit.com detour" },
    intent: { verdict: "aligned", assessment: "Matches the declared intent." },
    observations: ["Mostly coding on github.com"],
    suggestions: ["Batch reddit.com browsing to the end of the session to protect focus."],
    confidence: 0.8,
    ...over,
  };
}

describe("scoreReflection", () => {
  const okOutcome = (r: Reflection): Agent2Outcome => ({ ok: true, reflection: r });

  it("detects a hallucinated domain absent from the evidence", () => {
    const r = baseReflection({ narrative: "You worked on gitlab.com and github.com all session." });
    const card = scoreReflection(baseCase(), okOutcome(r));
    const hallucination = card.failures.find((f) => f.name === "hallucination.domains");
    expect(hallucination?.detail).toContain("gitlab.com");
  });

  it("detects a distraction source that is not real evidence", () => {
    const r = baseReflection({ distraction: { summary: "Off task.", sources: ["notreal.com"] } });
    const card = scoreReflection(baseCase(), okOutcome(r));
    expect(card.failures.map((f) => f.name)).toContain("evidence.distraction_sources");
  });

  it("flags an intent verdict that contradicts a missing intent", () => {
    const r = baseReflection({ intent: { verdict: "aligned", assessment: "x" } });
    const card = scoreReflection(baseCase({ intent: null }), okOutcome(r));
    expect(card.failures.map((f) => f.name)).toContain("consistency.intent");
  });

  it("fails an expected-verdict mismatch", () => {
    const r = baseReflection({ intent: { verdict: "diverged", assessment: "x" } });
    const c = baseCase({
      expected: { interpretation: {}, reflection: { intentVerdict: "aligned" } },
    });
    const card = scoreReflection(c, okOutcome(r));
    expect(card.failures.map((f) => f.name)).toContain("intent.verdict");
  });

  it("marks a malformed (schema-invalid) reflection as a schema failure", () => {
    const card = scoreReflection(baseCase(), { ok: false, error: "invalid_output" });
    expect(card.failures.map((f) => f.name)).toEqual(["schema.valid"]);
  });

  it("passes a clean, fully-grounded reflection", () => {
    const card = scoreReflection(baseCase(), okOutcome(baseReflection()));
    expect(card.failures).toHaveLength(0);
    expect(card.score).toBe(1);
  });
});
