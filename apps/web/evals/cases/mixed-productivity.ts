import { activityIndices, episode, interpretation, json, reflection, session } from "./builder";
import type { EvalCase } from "../types";

const timeline = session(0)
  .focus(0, "github.com", "billing.ts — watchme")
  .focus(25, "stackoverflow.com", "Stripe webhook signature verification")
  .focus(33, "slack.com", "#engineering - Slack")
  .focus(40, "reddit.com", "r/webdev")
  .focus(48, "github.com", "billing.ts — watchme")
  .compile(55);

const github = activityIndices(timeline, "github.com");
const stackoverflow = activityIndices(timeline, "stackoverflow.com");
const slack = activityIndices(timeline, "slack.com");
const reddit = activityIndices(timeline, "reddit.com");

export const mixedProductivity: EvalCase = {
  id: "mixed-productivity",
  name: "Mixed productive/unproductive work",
  scenario: "Solid Stripe integration work, a team-chat interruption, and one reddit.com detour.",
  intent: "Finish the Stripe API integration",
  timeline,
  interpretationOutput: json(
    interpretation([
      episode({
        label: "Implementing the Stripe billing integration",
        category: "coding",
        blockIndices: github,
        confidence: 0.85,
        evidenceNote: "The longest blocks, on billing.ts in github.com.",
      }),
      episode({
        label: "Looking up Stripe webhook verification",
        category: "coding",
        blockIndices: stackoverflow,
        evidenceNote: "A stackoverflow.com page on webhook signature verification.",
      }),
      episode({
        label: "Team chat in Slack",
        category: "communication",
        blockIndices: slack,
        relevanceToIntent: "partial",
        evidenceNote: "Seven minutes in #engineering on slack.com.",
      }),
      episode({
        label: "Browsing r/webdev",
        category: "entertainment",
        blockIndices: reddit,
        relevanceToIntent: "unrelated",
        isDistraction: true,
        evidenceNote: "An eight-minute reddit.com detour unrelated to the integration.",
      }),
    ]),
  ),
  reflectionOutput: json(
    reflection({
      narrative:
        "The core of the session was Stripe billing work on github.com and stackoverflow.com, broken up by slack.com chat and a reddit.com detour.",
      productivity: {
        label: "mixed",
        score: 58,
        assessment:
          "A strong opening coding block, then fragmentation from chat and a distraction.",
      },
      distraction: {
        summary:
          "One clear distraction, a reddit.com detour; the slack.com time was work-adjacent.",
        sources: ["reddit.com"],
      },
      focus: {
        strongest: "A 25-minute opening block on github.com on billing.ts.",
        weakest: "The stretch after the opening block, split across slack.com and reddit.com.",
      },
      intent: {
        verdict: "partial",
        assessment:
          "Meaningful progress on the Stripe integration, but chat and reddit.com diluted the back half.",
      },
      observations: [
        "The first block did most of the real work",
        "Momentum dropped once the slack.com and reddit.com switches began",
      ],
      suggestions: [
        "Defer non-urgent slack.com threads to a batch after the coding block to keep the early momentum.",
      ],
      confidence: 0.78,
    }),
  ),
  expected: {
    interpretation: {
      minEpisodes: 3,
      requiredCategories: ["coding", "communication", "entertainment"],
      requiredDistractionDomains: ["reddit.com"],
      forbiddenDistractionDomains: ["github.com", "slack.com", "stackoverflow.com"],
    },
    reflection: {
      intentVerdict: "partial",
      productivityLabels: ["mixed", "moderate"],
      mustMentionDomains: ["github.com"],
    },
  },
  metadata: { author: "eval-harness", createdAt: "2026-07-22", tags: ["mixed", "distraction"] },
};
