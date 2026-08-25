import {
  buildGroundedInterpretationSchema,
  type ActivityInterpretation,
  type CompiledTimeline,
} from "@watchme/shared";
import { complete, type CompleteOptions, type CompleteResult } from "../llm";
import { toTimelineMetrics } from "./metrics";
import { buildInterpretationMessages } from "./interpret-prompt";

/**
 * The activity interpretation step (Agent 1). Given a compiled timeline and
 * the declared intent, shapes the deterministic metrics, builds the prompt,
 * and calls the LLM abstraction with a grounding schema built fresh for this
 * timeline (`buildGroundedInterpretationSchema`) so any episode citing a
 * nonexistent or non-activity block fails validation and is retried inside
 * `complete`. `options.provider` lets tests inject a fake.
 */
export async function generateInterpretation(
  timeline: CompiledTimeline,
  intent: string | null,
  options: CompleteOptions = {},
): Promise<CompleteResult<ActivityInterpretation>> {
  const metrics = toTimelineMetrics(timeline);
  const messages = buildInterpretationMessages(metrics, intent);
  const schema = buildGroundedInterpretationSchema(timeline.blocks);
  return complete("interpret", messages, schema, options);
}
