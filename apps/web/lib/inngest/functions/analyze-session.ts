import { NonRetriableError } from "inngest";
import { REFLECTION_PROMPT_VERSION, type Reflection, ReflectionSchema } from "@watchme/shared";
import { createServiceClient } from "@/lib/api/service-client";
import { complete } from "@/lib/llm";
import { compile, type CompilerInputEvent } from "@/lib/pipeline/compiler";
import { toReflectionMetrics } from "@/lib/pipeline/metrics";
import { buildReflectionMessages } from "@/lib/pipeline/prompt";
import { inngest } from "../client";

/**
 * analyzeSession — the durable analysis pipeline (ARCHITECTURE.md §8, §10).
 *
 *   compile timeline → prepare metrics → generate reflection → persist
 *
 * Each stage is a separate `step.run`, so Inngest memoizes completed steps and
 * only the failed step re-runs on retry. The compile/prepare steps are
 * deterministic and therefore never re-executed once done; only the AI
 * generation (and the final persist) retry on transient failure. If every retry
 * is exhausted, `onFailure` marks the session `failed` so the dashboard can
 * still render the deterministic timeline with a retry action.
 */
export const analyzeSession = inngest.createFunction(
  {
    id: "analyze-session",
    retries: 3,
    onFailure: async ({ event }) => {
      const sessionId = event.data.event.data.sessionId;
      await createServiceClient()
        .from("sessions")
        .update({ analysis_status: "failed" })
        .eq("id", sessionId);
    },
  },
  { event: "session/analyze" },
  async ({ event, step }) => {
    const { sessionId } = event.data;

    // 1. Deterministic: load raw events, compile the timeline, persist stats.
    const compiled = await step.run("compile-timeline", async () => {
      const service = createServiceClient();

      const { data: session } = await service
        .from("sessions")
        .select("id, user_id, intent, started_at, ended_at")
        .eq("id", sessionId)
        .maybeSingle<{
          id: string;
          user_id: string;
          intent: string | null;
          started_at: string;
          ended_at: string | null;
        }>();

      if (!session) throw new NonRetriableError(`session ${sessionId} not found`);

      await service.from("sessions").update({ analysis_status: "running" }).eq("id", sessionId);

      const { data: rows } = await service
        .from("events")
        .select("type, occurred_at, domain, title, duration_ms")
        .eq("session_id", sessionId)
        .order("occurred_at", { ascending: true });

      const events: CompilerInputEvent[] = (rows ?? []).map((row) => ({
        type: row.type,
        occurredAt: Date.parse(row.occurred_at),
        domain: row.domain,
        title: row.title,
        durationMs: row.duration_ms,
      }));

      const timeline = compile(events, {
        startedAtMs: Date.parse(session.started_at),
        endedAtMs: session.ended_at ? Date.parse(session.ended_at) : Date.now(),
      });

      await service.from("sessions").update({ stats: timeline }).eq("id", sessionId);

      return { timeline, intent: session.intent, userId: session.user_id };
    });

    // 2. Deterministic: shape the metrics the model will interpret.
    const metrics = await step.run("prepare-metrics", () => toReflectionMetrics(compiled.timeline));

    // 3. AI: the only step that calls a model. Transient failures retry HERE
    //    without re-running the deterministic steps above.
    const generated = await step.run("generate-reflection", async () => {
      const messages = buildReflectionMessages(metrics, compiled.intent);
      const result = await complete("reflect", messages, ReflectionSchema);
      return {
        reflection: result.data,
        model: result.model,
        tokensUsed: result.usage ? result.usage.inputTokens + result.usage.outputTokens : null,
      };
    });

    // 4. Persist a new (versioned) report and mark the session complete.
    await step.run("persist-reflection", () =>
      persistReflection(sessionId, compiled.userId, generated),
    );

    return { sessionId, status: "complete" as const };
  },
);

async function persistReflection(
  sessionId: string,
  userId: string,
  generated: { reflection: Reflection; model: string; tokensUsed: number | null },
): Promise<void> {
  const service = createServiceClient();

  const { data: latest } = await service
    .from("reports")
    .select("version")
    .eq("session_id", sessionId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle<{ version: number }>();

  const version = (latest?.version ?? 0) + 1;

  const { error } = await service.from("reports").insert({
    session_id: sessionId,
    user_id: userId,
    version,
    reflection: generated.reflection,
    model: generated.model,
    prompt_version: REFLECTION_PROMPT_VERSION,
    tokens_used: generated.tokensUsed,
  });
  if (error) throw new Error(`failed to persist report: ${error.message}`);

  await service.from("sessions").update({ analysis_status: "complete" }).eq("id", sessionId);
}
