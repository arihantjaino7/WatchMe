import { activityIndices, episode, interpretation, json, reflection, session } from "./builder";
import type { EvalCase } from "../types";

// ~5 active minutes around a long idle gap: a deliberately low-signal session.
const timeline = session(0)
  .focus(0, "mail.google.com", "Inbox (12) - Gmail")
  .idle(3, 20)
  .compile(22);

const mail = activityIndices(timeline, "mail.google.com");

export const shortInterrupted: EvalCase = {
  id: "short-interrupted",
  name: "Short interrupted session",
  scenario: "A couple of minutes of email either side of a long idle gap — very little signal.",
  intent: "Quick email triage before standup",
  timeline,
  interpretationOutput: json(
    interpretation(
      [
        episode({
          label: "Triaging the Gmail inbox",
          category: "communication",
          blockIndices: mail,
          confidence: 0.4,
          evidenceNote: "Two brief mail.google.com inbox views around a long idle gap.",
        }),
      ],
      "Only about five minutes of tracked activity around a 17-minute idle gap; confidence is low.",
    ),
  ),
  reflectionOutput: json(
    reflection({
      narrative:
        "The tracked session was just a few minutes on mail.google.com around a long idle gap, so there is little to read into.",
      productivity: {
        label: "mixed",
        score: 45,
        assessment: "Too little tracked activity to judge — most of the window was idle.",
      },
      distraction: { summary: "No distractions observed in the short active window.", sources: [] },
      focus: {
        strongest: "The brief opening block on mail.google.com.",
        weakest: "The 17-minute idle gap that dominated the session.",
      },
      intent: {
        verdict: "aligned",
        assessment:
          "The little activity there was — mail.google.com triage — matches the email intent.",
      },
      observations: ["Most of the window was idle", "Only email activity was captured"],
      suggestions: [
        "If the idle time was still work, add those tools to capture so mail.google.com isn't the only signal.",
      ],
      confidence: 0.3,
    }),
  ),
  expected: {
    interpretation: {
      minEpisodes: 1,
      maxEpisodes: 2,
      requiredCategories: ["communication"],
      forbiddenDistractionDomains: ["mail.google.com"],
    },
    reflection: {
      intentVerdict: "aligned",
      productivityLabels: ["mixed", "low"],
      mustMentionDomains: ["mail.google.com"],
    },
  },
  metadata: { author: "eval-harness", createdAt: "2026-07-22", tags: ["low-signal", "short"] },
};
