import { describe, expect, it } from "vitest";
import {
  activityIndices,
  episode,
  interpretation,
  json,
  reflection,
  session,
} from "./cases/builder";
import { runAll, runCase } from "./runner";
import { formatReport } from "./report";
import type { EvalCase } from "./types";

const timeline = session(0)
  .focus(0, "github.com", "repo — watchme")
  .focus(20, "reddit.com", "r/programming")
  .compile(40);

const github = activityIndices(timeline, "github.com");
const reddit = activityIndices(timeline, "reddit.com");

function goodCase(): EvalCase {
  return {
    id: "good",
    name: "Good case",
    scenario: "",
    intent: "Work on the repo",
    timeline,
    interpretationOutput: json(
      interpretation([
        episode({ label: "Coding on the watchme repo", category: "coding", blockIndices: github }),
        episode({
          label: "Browsing r/programming",
          category: "entertainment",
          blockIndices: reddit,
          isDistraction: true,
          relevanceToIntent: "unrelated",
        }),
      ]),
    ),
    reflectionOutput: json(
      reflection({
        narrative: "Most of the session was coding on github.com, with a reddit.com detour.",
        productivity: { label: "high", score: 78, assessment: "Sustained coding on github.com." },
        distraction: { summary: "A reddit.com detour.", sources: ["reddit.com"] },
        focus: { strongest: "A 20-minute github.com block", weakest: "The reddit.com detour" },
        intent: { verdict: "aligned", assessment: "Coding matches the repo intent." },
        observations: ["Coding dominated the session"],
        suggestions: ["Save reddit.com for after the coding block to protect focus."],
        confidence: 0.8,
      }),
    ),
    expected: {
      interpretation: {
        requiredDistractionDomains: ["reddit.com"],
        forbiddenDistractionDomains: ["github.com"],
      },
      reflection: { intentVerdict: "aligned", mustMentionDomains: ["github.com"] },
    },
    metadata: { author: "t", createdAt: "2026-07-22", tags: [] },
  };
}

describe("runCase", () => {
  it("scores a clean case at 1.0 for both agents with no failures", async () => {
    const result = await runCase(goodCase());
    expect(result.agent1.failures).toHaveLength(0);
    expect(result.agent2.failures).toHaveLength(0);
    expect(result.agent1.score).toBe(1);
    expect(result.agent2.score).toBe(1);
  });

  it("records full version metadata", async () => {
    const { versions } = await runCase(goodCase());
    expect(versions.model).toBe("gemini-2.0-flash");
    expect(versions.provider).toBe("fixture");
    expect(versions.compilerVersion).toBeGreaterThan(0);
    expect(versions.interpretationPromptVersion).toMatch(/interpret-/);
    expect(versions.reflectionPromptVersion).toMatch(/reflect-/);
  });

  it("detects a grounding regression (interpretation cites a nonexistent block)", async () => {
    const broken: EvalCase = {
      ...goodCase(),
      id: "broken-grounding",
      interpretationOutput: json(
        interpretation([
          episode({ label: "Coding somewhere", category: "coding", blockIndices: [99] }),
        ]),
      ),
    };
    const result = await runCase(broken);
    expect(result.agent1.failures.length).toBeGreaterThan(0);
    expect(result.agent1.score).toBeLessThan(1);
  });

  it("detects a malformed reflection as a schema failure", async () => {
    const broken: EvalCase = {
      ...goodCase(),
      id: "malformed-reflection",
      reflectionOutput: "this is not json at all",
    };
    const result = await runCase(broken);
    expect(result.agent2.failures.map((f) => f.name)).toContain("schema.valid");
  });
});

describe("runAll + formatReport", () => {
  it("aggregates totals and flags the run as failed when any case fails", async () => {
    const broken: EvalCase = {
      ...goodCase(),
      id: "broken",
      name: "Broken case",
      reflectionOutput: "not json",
    };
    const run = await runAll([goodCase(), broken]);

    expect(run.ok).toBe(false);
    expect(run.totals.failures).toBeGreaterThan(0);
    expect(run.cases).toHaveLength(2);
  });

  it("marks a run of only-passing cases as ok", async () => {
    const run = await runAll([goodCase()]);
    expect(run.ok).toBe(true);
    expect(run.totals.failures).toBe(0);
  });

  it("renders a report with a version header, rows, totals, and a PASS/FAIL line", async () => {
    const run = await runAll([goodCase()]);
    const report = formatReport(run);
    expect(report).toContain("WatchMe AI — Evaluation Report");
    expect(report).toContain("Good case");
    expect(report).toContain("TOTALS");
    expect(report).toContain("RESULT: PASS");
  });
});
