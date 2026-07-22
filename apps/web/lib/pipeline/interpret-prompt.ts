import { INTERPRETATION_PROMPT_VERSION } from "@watchme/shared";
import type { LlmMessage } from "../llm/provider";
import type { TimelineMetrics } from "./metrics";

export { INTERPRETATION_PROMPT_VERSION };

/**
 * The Activity Interpreter's system prompt (Agent 1). A classification/
 * grouping engine, not a reasoning engine -- it labels and groups evidence it
 * is given, it never invents evidence.
 */
export const INTERPRETATION_SYSTEM_PROMPT = `You are WatchMe's activity interpreter. You group a session's compiled timeline blocks into labeled "work episodes" and flag likely distractions.

Rules:
- The supplied timeline blocks are the ONLY source of truth. Every episode must cite the "index" values of the blocks it is grounded in, and those blocks must be real entries from the supplied timeline.
- Only "activity" blocks (domain, category, title present) can be part of a work episode. Never cite an "idle" or "redacted" block -- they carry no page context and cannot be work.
- Infer what the work likely was (e.g. "Implementing OAuth", "Debugging a React state bug", "Researching Supabase RLS") using ONLY the domain, category, and page title of the cited blocks. Never invent a tool, technology, or task the evidence does not support.
- Disambiguate ambiguous categories using the page title: a youtube.com block could be a tutorial or entertainment; a twitter.com/x.com block could be dev-community research or a distraction. Decide from the title, not a guess.
- Flag an episode as a distraction/rabbit-hole candidate when it is off-topic relative to the declared intent or clearly unrelated to the surrounding work.
- Do not calculate durations or times -- you are given no duration/time fields to fill in for an episode; only reference the block indices you are grounded in.
- Give each episode a confidence score reflecting how clear the evidence is. Use the uncertaintyNote field for any session-level caveat (e.g. very little tracked activity, unusually generic page titles). Do not over-read thin data.
- Keep labels short and specific, evidence notes short and factual.
- Respond with ONLY a single JSON object matching the required schema. No prose, no markdown, no code fences.`;

/**
 * Builds the [system, user] message pair for the interpretation call. The user
 * message carries the declared intent and the deterministic timeline metrics
 * (including each block's "index", which episodes must cite) as JSON.
 */
export function buildInterpretationMessages(
  metrics: TimelineMetrics,
  intent: string | null,
): LlmMessage[] {
  const intentLine = intent && intent.trim().length > 0 ? intent.trim() : "(none declared)";

  const userContent = [
    `Declared intent: ${intentLine}`,
    "",
    'Session timeline (deterministic, already computed). Each entry\'s "index" is what episodes must cite in blockIndices:',
    JSON.stringify(metrics, null, 2),
    "",
    "Produce the activity interpretation as a single JSON object.",
  ].join("\n");

  return [
    { role: "system", content: INTERPRETATION_SYSTEM_PROMPT },
    { role: "user", content: userContent },
  ];
}
