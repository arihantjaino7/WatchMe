import { REFLECTION_PROMPT_VERSION } from "@watchme/shared";
import type { LlmMessage } from "../llm/provider";
import type { InterpretedActivity } from "./episodes";
import type { TimelineMetrics } from "./metrics";

export { REFLECTION_PROMPT_VERSION };

/**
 * The Reflection Analyst's system prompt (Agent 2). Constrains the model to a
 * work-reflection engine that interprets — never recomputes — the supplied
 * evidence, and forbids invention and motivational filler.
 */
export const REFLECTION_SYSTEM_PROMPT = `You are WatchMe's work-reflection engine. You turn a deterministic timeline of a single work session into an honest, specific reflection.

Rules:
- The supplied metrics are the ONLY source of truth. Never invent activity, durations, domains, or times that are not in the evidence.
- You interpret; you do not calculate. Every number you cite must come from the metrics as given.
- You may also receive labeled work episodes from an activity interpreter (e.g. "Implementing OAuth", flagged distractions). Treat their groupings and labels as additional evidence about WHAT the work was — but the numeric metrics remain the only authoritative source for any number you cite, including episode durations.
- Reference concrete evidence (specific domains, categories, times, durations) — not generic advice.
- No motivational fluff, no praise padding, no hedging clichés. Be direct and concise.
- Judge the session against the declared intent. If no intent was declared, say so and set the intent verdict to "no_intent".
- If the session has little tracked activity (signal is "low"), say the data is thin and lower your confidence rather than over-reading it.
- Keep every field concise. Provide 1 to 3 suggestions, each concrete and immediately actionable.
- Respond with ONLY a single JSON object matching the required schema. No prose, no markdown, no code fences.`;

/**
 * Builds the [system, user] message pair for the reflection call. The user
 * message carries the declared intent, the deterministic metrics, and Agent
 * 1's interpreted work episodes (with derived, code-computed timing) as JSON.
 */
export function buildReflectionMessages(
  metrics: TimelineMetrics,
  activity: InterpretedActivity,
  intent: string | null,
): LlmMessage[] {
  const intentLine = intent && intent.trim().length > 0 ? intent.trim() : "(none declared)";

  const userContent = [
    `Declared intent: ${intentLine}`,
    "",
    "Session metrics (deterministic, already computed — interpret only):",
    JSON.stringify(metrics, null, 2),
    "",
    "Interpreted work episodes (labels/grouping from Agent 1; timing derived deterministically from the metrics above):",
    JSON.stringify(activity, null, 2),
    "",
    "Produce the reflection as a single JSON object.",
  ].join("\n");

  return [
    { role: "system", content: REFLECTION_SYSTEM_PROMPT },
    { role: "user", content: userContent },
  ];
}
