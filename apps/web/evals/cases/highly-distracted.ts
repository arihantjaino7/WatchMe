import { activityIndices, episode, interpretation, json, reflection, session } from "./builder";
import type { EvalCase } from "../types";

const timeline = session(0)
  .focus(0, "github.com", "blog/launch-post.md — watchme")
  .focus(8, "reddit.com", "r/programming — What's your launch checklist?")
  .focus(20, "youtube.com", "I Built a Startup in 30 Days")
  .focus(35, "twitter.com", "Home / X")
  .focus(45, "github.com", "blog/launch-post.md — watchme")
  .compile(50);

const github = activityIndices(timeline, "github.com");
const reddit = activityIndices(timeline, "reddit.com");
const youtube = activityIndices(timeline, "youtube.com");
const twitter = activityIndices(timeline, "twitter.com");

export const highlyDistracted: EvalCase = {
  id: "highly-distracted",
  name: "Highly distracted session",
  scenario: "A little writing bookended by long stretches of Reddit, YouTube, and Twitter.",
  intent: "Write the launch blog post",
  timeline,
  interpretationOutput: json(
    interpretation([
      episode({
        label: "Drafting the launch blog post",
        category: "coding",
        blockIndices: github,
        confidence: 0.75,
        evidenceNote: "Two short visits to blog/launch-post.md on github.com.",
      }),
      episode({
        label: "Browsing r/programming",
        category: "entertainment",
        blockIndices: reddit,
        relevanceToIntent: "unrelated",
        isDistraction: true,
        evidenceNote: "A 12-minute reddit.com thread unrelated to writing the post.",
      }),
      episode({
        label: "Watching a startup YouTube video",
        category: "entertainment",
        blockIndices: youtube,
        relevanceToIntent: "unrelated",
        isDistraction: true,
        evidenceNote: "A 15-minute youtube.com video.",
      }),
      episode({
        label: "Scrolling X / Twitter",
        category: "social",
        blockIndices: twitter,
        relevanceToIntent: "unrelated",
        isDistraction: true,
        evidenceNote: "A 10-minute twitter.com session.",
      }),
    ]),
  ),
  reflectionOutput: json(
    reflection({
      narrative:
        "Only the opening and closing minutes on github.com went to the blog post; the middle was reddit.com, youtube.com, and twitter.com.",
      productivity: {
        label: "low",
        score: 22,
        assessment: "The large majority of active time was off-task browsing, not writing.",
      },
      distraction: {
        summary:
          "Three long distraction blocks — reddit.com, youtube.com, and twitter.com — dominated.",
        sources: ["reddit.com", "youtube.com", "twitter.com"],
      },
      focus: {
        strongest:
          "Ironically the longest uninterrupted blocks were the youtube.com and reddit.com detours.",
        weakest: "The two short github.com blocks were too brief to make progress on the post.",
      },
      intent: {
        verdict: "diverged",
        assessment:
          "The intent was to write the launch post, but most time went to reddit.com and youtube.com.",
      },
      observations: [
        "Actual writing time on github.com was under fifteen minutes",
        "Each distraction block ran longer than either work block",
      ],
      suggestions: [
        "Block reddit.com, youtube.com, and twitter.com for the next writing session and start with a 25-minute timer.",
      ],
      confidence: 0.85,
    }),
  ),
  expected: {
    interpretation: {
      minEpisodes: 3,
      requiredCategories: ["coding", "entertainment", "social"],
      requiredDistractionDomains: ["reddit.com", "youtube.com", "twitter.com"],
      forbiddenDistractionDomains: ["github.com"],
    },
    reflection: {
      intentVerdict: "diverged",
      productivityLabels: ["low", "mixed"],
      mustMentionDomains: ["github.com"],
    },
  },
  metadata: { author: "eval-harness", createdAt: "2026-07-22", tags: ["distraction"] },
};
