import { type CompiledTimeline, type Reflection, ReflectionSchema } from "@watchme/shared";
import { complete, type CompleteOptions, type CompleteResult } from "../llm";
import { toReflectionMetrics } from "./metrics";
import { buildReflectionMessages } from "./prompt";

/**
 * The reflection generation step (Agent 2). Given a compiled timeline and the
 * declared intent, shapes the deterministic metrics, builds the prompt, and
 * calls the LLM abstraction with the strict `ReflectionSchema`. Validation and
 * schema-failure retries happen inside `complete`; this is the ONLY AI step of
 * the pipeline. `options.provider` lets tests inject a fake.
 */
export async function generateReflection(
  timeline: CompiledTimeline,
  intent: string | null,
  options: CompleteOptions = {},
): Promise<CompleteResult<Reflection>> {
  const metrics = toReflectionMetrics(timeline);
  const messages = buildReflectionMessages(metrics, intent);
  return complete("reflect", messages, ReflectionSchema, options);
}
