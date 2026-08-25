import type { ZodType } from "zod";
import { LlmError, type LlmMessage, type LlmProvider, type LlmUsage } from "./provider";
import { geminiProvider } from "./providers/gemini";

/**
 * The single entry point for every model call. `complete` routes a task to a
 * model, invokes the provider, extracts JSON from the raw output, validates it
 * against a Zod schema, and re-prompts on validation failure. Malformed output
 * is never returned silently.
 */

export type LlmTask = "interpret" | "reflect";

type TaskConfig = { model: string; temperature: number };

/**
 * The ONLY place in the codebase that names a model. Kept low-temperature for
 * deterministic, evidence-grounded output. Model ids are env-overridable so a
 * provider/model swap never touches call sites.
 */
const TASK_CONFIG: Record<LlmTask, TaskConfig> = {
  interpret: { model: process.env.LLM_INTERPRET_MODEL ?? "gemini-2.0-flash", temperature: 0.2 },
  reflect: { model: process.env.LLM_REFLECT_MODEL ?? "gemini-2.0-flash", temperature: 0.3 },
};

const DEFAULT_MAX_ATTEMPTS = 2;
const DEFAULT_TIMEOUT_MS = 60_000;

export type CompleteOptions = {
  /** Inject a provider (tests pass a fake). Defaults to the Gemini adapter. */
  provider?: LlmProvider;
  timeoutMs?: number;
  /** Number of schema-validation attempts before giving up. */
  maxAttempts?: number;
};

export type CompleteResult<T> = {
  data: T;
  usage: LlmUsage;
  model: string;
};

export async function complete<T>(
  task: LlmTask,
  messages: LlmMessage[],
  schema: ZodType<T>,
  options: CompleteOptions = {},
): Promise<CompleteResult<T>> {
  const config = TASK_CONFIG[task];
  const provider = options.provider ?? geminiProvider;
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let conversation = messages;
  let lastIssue = "unknown validation error";

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // Provider/timeout errors propagate to the caller (the Inngest step retries).
    const result = await provider.generate({
      model: config.model,
      messages: conversation,
      temperature: config.temperature,
      timeoutMs,
      json: true,
    });

    const parsed = parseAgainstSchema(result.text, schema);
    if (parsed.ok) {
      return { data: parsed.data, usage: result.usage, model: config.model };
    }

    lastIssue = parsed.issue;
    // Feed the invalid attempt back and ask for a correction on the next round.
    conversation = [
      ...messages,
      { role: "assistant", content: result.text },
      {
        role: "user",
        content: `Your previous response was invalid (${parsed.issue}). Respond again with ONLY a JSON object matching the required schema, no prose or code fences.`,
      },
    ];
  }

  throw new LlmError(
    "invalid_output",
    `model output failed schema validation after ${maxAttempts} attempt(s): ${lastIssue}`,
  );
}

type ParseResult<T> = { ok: true; data: T } | { ok: false; issue: string };

function parseAgainstSchema<T>(text: string, schema: ZodType<T>): ParseResult<T> {
  const json = extractJsonObject(text);
  if (json === null) return { ok: false, issue: "no JSON object found in output" };

  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return { ok: false, issue: "output was not parseable JSON" };
  }

  const result = schema.safeParse(value);
  if (!result.success) {
    const issue = result.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    return { ok: false, issue };
  }
  return { ok: true, data: result.data };
}

/** Pull the first `{...}` object out of raw output, tolerating code fences and prose. */
function extractJsonObject(text: string): string | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] ?? text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  return candidate.slice(start, end + 1);
}
