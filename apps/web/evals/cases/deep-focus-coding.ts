import { activityIndices, episode, interpretation, json, reflection, session } from "./builder";
import type { EvalCase } from "../types";

const timeline = session(0)
  .focus(0, "github.com", "watchme/auth · Pull Request #42")
  .focus(40, "developer.mozilla.org", "OAuth 2.0 — HTTP | MDN")
  .focus(48, "github.com", "watchme/auth · Pull Request #42")
  .idle(53, 55)
  .compile(58);

const github = activityIndices(timeline, "github.com");
const mdn = activityIndices(timeline, "developer.mozilla.org");

export const deepFocusCoding: EvalCase = {
  id: "deep-focus-coding",
  name: "Deep focused coding",
  scenario:
    "A long, sustained coding session on one pull request with a single documentation lookup.",
  intent: "Ship the OAuth login flow",
  timeline,
  interpretationOutput: json(
    interpretation([
      episode({
        label: "Implementing the OAuth login flow",
        category: "coding",
        blockIndices: github,
        confidence: 0.9,
        evidenceNote: "Sustained work on the watchme/auth pull request on github.com.",
      }),
      episode({
        label: "Reading MDN's OAuth 2.0 documentation",
        category: "docs",
        blockIndices: mdn,
        confidence: 0.85,
        evidenceNote: "An 8-minute OAuth 2.0 reference lookup on developer.mozilla.org.",
      }),
    ]),
  ),
  reflectionOutput: json(
    reflection({
      narrative:
        "You spent almost the entire session on github.com implementing the auth pull request, with one short detour to developer.mozilla.org for OAuth 2.0 reference.",
      productivity: {
        label: "high",
        score: 88,
        assessment:
          "Most active minutes were a single uninterrupted block of coding on github.com.",
      },
      distraction: {
        summary: "No distractions; every block was coding or documentation.",
        sources: [],
      },
      focus: {
        strongest: "A 40-minute uninterrupted block on github.com at the start.",
        weakest: "A short github.com block after the idle gap near the end.",
      },
      intent: {
        verdict: "aligned",
        assessment:
          "The intent to ship the OAuth login flow matches the sustained github.com auth work.",
      },
      observations: [
        "Focus concentrated in one long early block",
        "Only a single documentation lookup interrupted the coding",
      ],
      suggestions: [
        "Batch documentation lookups before coding to protect the opening 40-minute focus block.",
      ],
      confidence: 0.85,
    }),
  ),
  expected: {
    interpretation: {
      minEpisodes: 2,
      maxEpisodes: 3,
      requiredCategories: ["coding", "docs"],
      forbiddenDistractionDomains: ["github.com", "developer.mozilla.org"],
    },
    reflection: {
      intentVerdict: "aligned",
      productivityLabels: ["high"],
      minSuggestions: 1,
      mustMentionDomains: ["github.com"],
    },
  },
  metadata: { author: "eval-harness", createdAt: "2026-07-22", tags: ["coding", "focus"] },
};
