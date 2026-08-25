import { activityIndices, episode, interpretation, json, reflection, session } from "./builder";
import type { EvalCase } from "../types";

const timeline = session(0)
  .focus(0, "supabase.com", "pgvector | Supabase Docs")
  .focus(10, "github.com", "pgvector/pgvector: Open-source vector similarity")
  .focus(16, "stackoverflow.com", "Choosing between pgvector and a hosted vector DB")
  .focus(24, "supabase.com", "Vector columns | Supabase")
  .focus(30, "github.com", "supabase/supabase examples")
  .compile(38);

const supabase = activityIndices(timeline, "supabase.com");
const github = activityIndices(timeline, "github.com");
const stackoverflow = activityIndices(timeline, "stackoverflow.com");

export const researchHeavy: EvalCase = {
  id: "research-heavy",
  name: "Research-heavy browsing",
  scenario: "Comparing vector database options across docs, repos, and Q&A, switching frequently.",
  intent: "Research vector database options for V2",
  timeline,
  interpretationOutput: json(
    interpretation([
      episode({
        label: "Researching pgvector on the Supabase docs",
        category: "docs",
        blockIndices: supabase,
        evidenceNote: "Two supabase.com pages on pgvector and vector columns.",
      }),
      episode({
        label: "Reviewing pgvector source and examples on GitHub",
        category: "coding",
        blockIndices: github,
        evidenceNote: "The pgvector repo and supabase examples on github.com.",
      }),
      episode({
        label: "Comparing vector databases on Stack Overflow",
        category: "coding",
        blockIndices: stackoverflow,
        confidence: 0.7,
        evidenceNote: "A stackoverflow.com thread weighing pgvector against a hosted option.",
      }),
    ]),
  ),
  reflectionOutput: json(
    reflection({
      narrative:
        "You compared vector database options, moving between supabase.com docs, the pgvector repo on github.com, and a stackoverflow.com comparison thread.",
      productivity: {
        label: "moderate",
        score: 60,
        assessment: "Genuine research, but spread thin across five short blocks and three sites.",
      },
      distraction: { summary: "All browsing was on-topic research; no distractions.", sources: [] },
      focus: {
        strongest: "The opening 10-minute block on supabase.com.",
        weakest: "The frequent switching between supabase.com, github.com, and stackoverflow.com.",
      },
      intent: {
        verdict: "aligned",
        assessment:
          "Every site visited was part of researching vector databases, the declared intent.",
      },
      observations: [
        "Time split fairly evenly across three research sources",
        "No single block long enough to count as deep focus",
      ],
      suggestions: [
        "Timebox the supabase.com reading, then write a short decision note before opening more tabs.",
      ],
      confidence: 0.7,
    }),
  ),
  expected: {
    interpretation: {
      minEpisodes: 2,
      requiredCategories: ["docs", "coding"],
      forbiddenDistractionDomains: ["supabase.com", "github.com", "stackoverflow.com"],
    },
    reflection: {
      intentVerdict: "aligned",
      productivityLabels: ["moderate", "high"],
      mustMentionDomains: ["supabase.com"],
    },
  },
  metadata: { author: "eval-harness", createdAt: "2026-07-22", tags: ["research", "browsing"] },
};
