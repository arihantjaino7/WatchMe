import type { LlmGenerateResult, LlmProvider } from "../lib/llm/provider";

/**
 * Deterministic, offline LLM provider for evaluation. Returns stored model
 * outputs (a single string, or a sequence consumed one per call) instead of
 * calling a real model, so the whole harness runs with no network. Implements
 * the production `LlmProvider` interface so it drops straight into
 * `complete()` via `generate*()`'s `{ provider }` option.
 */
export function fixtureProvider(outputs: string | string[], name = "fixture"): LlmProvider {
  const texts = Array.isArray(outputs) ? outputs : [outputs];
  let call = 0;
  return {
    name,
    async generate(): Promise<LlmGenerateResult> {
      const text = texts[Math.min(call, texts.length - 1)]!;
      call += 1;
      return { text, usage: { inputTokens: 0, outputTokens: 0 } };
    },
  };
}
