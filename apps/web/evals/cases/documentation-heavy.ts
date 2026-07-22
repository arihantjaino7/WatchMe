import { activityIndices, episode, interpretation, json, reflection, session } from "./builder";
import type { EvalCase } from "../types";

const timeline = session(0)
  .focus(0, "nextjs.org", "App Router | Next.js")
  .focus(20, "react.dev", "useState – React")
  .focus(35, "developer.mozilla.org", "Using the Fetch API - MDN")
  .focus(50, "nextjs.org", "Data Fetching | Next.js")
  .compile(60);

const nextjs = activityIndices(timeline, "nextjs.org");
const react = activityIndices(timeline, "react.dev");
const mdn = activityIndices(timeline, "developer.mozilla.org");

export const documentationHeavy: EvalCase = {
  id: "documentation-heavy",
  name: "Documentation-heavy work",
  scenario: "A learning session spent almost entirely reading framework documentation.",
  intent: "Learn the Next.js App Router",
  timeline,
  interpretationOutput: json(
    interpretation([
      episode({
        label: "Studying the Next.js App Router",
        category: "docs",
        blockIndices: nextjs,
        confidence: 0.9,
        evidenceNote: "Two visits to nextjs.org App Router and Data Fetching pages.",
      }),
      episode({
        label: "Reviewing React useState documentation",
        category: "docs",
        blockIndices: react,
        evidenceNote: "A useState reference page on react.dev.",
      }),
      episode({
        label: "Reading MDN's Fetch API guide",
        category: "docs",
        blockIndices: mdn,
        evidenceNote: "The Fetch API guide on developer.mozilla.org.",
      }),
    ]),
  ),
  reflectionOutput: json(
    reflection({
      narrative:
        "The session was documentation reading throughout: nextjs.org for the App Router, react.dev for hooks, and developer.mozilla.org for the Fetch API.",
      productivity: {
        label: "high",
        score: 82,
        assessment:
          "Every block was uninterrupted documentation reading, matching a learning goal.",
      },
      distraction: { summary: "No distractions; all activity was documentation.", sources: [] },
      focus: {
        strongest: "A 20-minute opening block on nextjs.org.",
        weakest: "The final 10-minute nextjs.org block, the shortest of the session.",
      },
      intent: {
        verdict: "aligned",
        assessment: "Reading the Next.js App Router docs directly serves the intent to learn it.",
      },
      observations: [
        "All time went to documentation, none to writing code",
        "Reading was spread evenly across three reference sites",
      ],
      suggestions: [
        "Follow the nextjs.org reading with a small scratch project to convert the docs into practice.",
      ],
      confidence: 0.8,
    }),
  ),
  expected: {
    interpretation: {
      minEpisodes: 2,
      requiredCategories: ["docs"],
      forbiddenDistractionDomains: ["nextjs.org", "react.dev", "developer.mozilla.org"],
    },
    reflection: {
      intentVerdict: "aligned",
      productivityLabels: ["high", "moderate"],
      mustMentionDomains: ["nextjs.org"],
    },
  },
  metadata: { author: "eval-harness", createdAt: "2026-07-22", tags: ["docs", "learning"] },
};
