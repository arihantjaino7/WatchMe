import { activityIndices, episode, interpretation, json, reflection, session } from "./builder";
import type { EvalCase } from "../types";

const timeline = session(0)
  .focus(0, "github.com", "auth.test.ts — watchme")
  .focus(8, "stackoverflow.com", "TypeError: cannot read property of undefined")
  .focus(14, "github.com", "auth.test.ts — watchme")
  .focus(22, "stackoverflow.com", "Jest mock not resetting between tests")
  .focus(28, "github.com", "auth.test.ts — watchme")
  .compile(40);

const github = activityIndices(timeline, "github.com");
const stackoverflow = activityIndices(timeline, "stackoverflow.com");

export const debuggingSession: EvalCase = {
  id: "debugging-session",
  name: "Debugging session",
  scenario:
    "Alternating between editing a failing test and searching Stack Overflow for the errors.",
  intent: "Fix the failing auth integration test",
  timeline,
  interpretationOutput: json(
    interpretation([
      episode({
        label: "Debugging the failing auth integration test",
        category: "coding",
        blockIndices: github,
        confidence: 0.85,
        evidenceNote: "Repeated returns to auth.test.ts on github.com.",
      }),
      episode({
        label: "Searching Stack Overflow for the test errors",
        category: "coding",
        blockIndices: stackoverflow,
        confidence: 0.8,
        evidenceNote: "Two stackoverflow.com lookups for the TypeError and a Jest mock issue.",
      }),
    ]),
  ),
  reflectionOutput: json(
    reflection({
      narrative:
        "You cycled between auth.test.ts on github.com and error searches on stackoverflow.com, a classic debugging loop.",
      productivity: {
        label: "moderate",
        score: 62,
        assessment: "Real progress on the test, but fragmented across many short blocks.",
      },
      distraction: {
        summary: "No off-task browsing; every switch was between the editor and Stack Overflow.",
        sources: [],
      },
      focus: {
        strongest: "The final 12-minute github.com block once the fix took shape.",
        weakest: "The rapid early alternation between github.com and stackoverflow.com.",
      },
      intent: {
        verdict: "aligned",
        assessment: "Every block served fixing the failing auth test, the declared intent.",
      },
      observations: [
        "Four context switches between editor and search",
        "Blocks lengthened toward the end as the problem narrowed",
      ],
      suggestions: [
        "Collect the stackoverflow.com findings into notes before editing to cut the back-and-forth switching.",
      ],
      confidence: 0.75,
    }),
  ),
  expected: {
    interpretation: {
      minEpisodes: 2,
      requiredCategories: ["coding"],
      forbiddenDistractionDomains: ["github.com", "stackoverflow.com"],
    },
    reflection: {
      intentVerdict: "aligned",
      productivityLabels: ["moderate", "mixed"],
      mustMentionDomains: ["github.com", "stackoverflow.com"],
    },
  },
  metadata: { author: "eval-harness", createdAt: "2026-07-22", tags: ["debugging", "coding"] },
};
