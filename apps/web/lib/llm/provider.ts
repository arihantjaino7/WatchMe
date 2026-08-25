/**
 * Provider-agnostic LLM interface. Concrete providers (Gemini, and later Groq)
 * implement `LlmProvider`; nothing outside this `lib/llm` directory imports a
 * provider or names a model (ARCHITECTURE.md §8).
 */

export type LlmRole = "system" | "user" | "assistant";
export type LlmMessage = { role: LlmRole; content: string };

export type LlmUsage = { inputTokens: number; outputTokens: number } | null;

export type LlmGenerateOptions = {
  model: string;
  messages: LlmMessage[];
  temperature: number;
  /** Abort the request after this many milliseconds. */
  timeoutMs: number;
  /** Ask the provider to emit JSON (providers may enforce a JSON mime type). */
  json: boolean;
};

export type LlmGenerateResult = {
  text: string;
  usage: LlmUsage;
};

export interface LlmProvider {
  readonly name: string;
  generate(options: LlmGenerateOptions): Promise<LlmGenerateResult>;
}

export type LlmErrorKind = "provider" | "timeout" | "invalid_output";

/**
 * Typed failure surface. `provider`/`timeout` are transient and left to
 * propagate so the Inngest step that called `complete` retries the whole step;
 * `invalid_output` means the model could not produce schema-valid JSON even
 * after in-call retries.
 */
export class LlmError extends Error {
  readonly kind: LlmErrorKind;

  constructor(kind: LlmErrorKind, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "LlmError";
    this.kind = kind;
  }
}
