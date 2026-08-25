import {
  type ActivityInterpretation,
  type CompiledTimeline,
  type Reflection,
  ReflectionSchema,
} from "@watchme/shared";
import { complete, type CompleteOptions, type CompleteResult } from "../llm";
import { deriveInterpretedActivity } from "./episodes";
import { toTimelineMetrics } from "./metrics";
import { buildReflectionMessages } from "./prompt";

/**
 * The reflection generation step (Agent 2). Given a compiled timeline, Agent
 * 1's interpretation, and the declared intent: shapes the deterministic
 * metrics, derives timed episodes from the interpretation (code-computed, not
 * model-computed), builds the prompt, and calls the LLM abstraction with the
 * strict `ReflectionSchema`. Validation and schema-failure retries happen
 * inside `complete`; this is the ONLY AI step of this stage. `options.provider`
 * lets tests inject a fake.
 */
export async function generateReflection(
  timeline: CompiledTimeline,
  interpretation: ActivityInterpretation,
  intent: string | null,
  options: CompleteOptions = {},
): Promise<CompleteResult<Reflection>> {
  const metrics = toTimelineMetrics(timeline);
  const activity = deriveInterpretedActivity(interpretation, timeline.blocks);
  const messages = buildReflectionMessages(metrics, activity, intent);
  return complete("reflect", messages, ReflectionSchema, options);
}
