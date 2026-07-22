import {
  LlmError,
  type LlmGenerateOptions,
  type LlmGenerateResult,
  type LlmMessage,
  type LlmProvider,
} from "../provider";

/**
 * Gemini adapter over the Generative Language REST API. Uses `fetch` (no SDK
 * dependency) so the abstraction stays dependency-light. The model id is chosen
 * by `lib/llm/index.ts`; this file only knows how to talk to Gemini.
 */

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

type GeminiResponse = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
};

async function generate(options: LlmGenerateOptions): Promise<LlmGenerateResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new LlmError("provider", "GEMINI_API_KEY is not set");

  const { system, contents } = toGeminiPayload(options.messages);
  const body = {
    contents,
    ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
    generationConfig: {
      temperature: options.temperature,
      ...(options.json ? { responseMimeType: "application/json" } : {}),
    },
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);

  let response: Response;
  try {
    response = await fetch(
      `${GEMINI_BASE}/${encodeURIComponent(options.model)}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      },
    );
  } catch (err) {
    if (controller.signal.aborted) {
      throw new LlmError("timeout", `gemini request timed out after ${options.timeoutMs}ms`, {
        cause: err,
      });
    }
    throw new LlmError("provider", "gemini request failed", { cause: err });
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new LlmError("provider", `gemini responded ${response.status}: ${detail.slice(0, 300)}`);
  }

  const payload = (await response.json()) as GeminiResponse;
  const text =
    payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
  if (!text) throw new LlmError("provider", "gemini returned an empty completion");

  return {
    text,
    usage: payload.usageMetadata
      ? {
          inputTokens: payload.usageMetadata.promptTokenCount ?? 0,
          outputTokens: payload.usageMetadata.candidatesTokenCount ?? 0,
        }
      : null,
  };
}

/** Gemini splits the system prompt out and uses role "model" for assistant turns. */
function toGeminiPayload(messages: LlmMessage[]) {
  const systemParts: string[] = [];
  const contents: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }> = [];

  for (const message of messages) {
    if (message.role === "system") {
      systemParts.push(message.content);
      continue;
    }
    contents.push({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content }],
    });
  }

  return { system: systemParts.join("\n\n") || undefined, contents };
}

export const geminiProvider: LlmProvider = { name: "gemini", generate };
