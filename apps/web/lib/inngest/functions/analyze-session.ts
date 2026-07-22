import { NonRetriableError } from "inngest";
import {
  INTERPRETATION_PROMPT_VERSION,
  REFLECTION_PROMPT_VERSION,
  type ActivityInterpretation,
  type Reflection,
} from "@watchme/shared";
import { createServiceClient } from "@/lib/api/service-client";
import { compile, type CompilerInputEvent } from "@/lib/pipeline/compiler";
import { generateInterpretation } from "@/lib/pipeline/interpret";
import { generateReflection } from "@/lib/pipeline/reflect";
import { inngest } from "../client";

/**
 * analyzeSession — the durable analysis pipeline (ARCHITECTURE.md §8, §10).
 *
 *   compile timeline → interpret activity → persist → generate reflection → persist
 *
 * Each stage is a separate `step.run`, so Inngest memoizes completed steps and
 * only the failed step re-runs on retry. `compile-timeline` is deterministic
 * and therefore never re-executed once done; the two AI steps (interpret,
 * reflect) and their persist steps are kept separate so a transient DB error
 * retries only the write, never re-spends an LLM call. If every retry is
 * exhausted, `onFailure` marks the session `failed` so the dashboard can still
 * render the deterministic timeline with a retry action.
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

    // 2. AI (Agent 1): group the compiled timeline into labeled work episodes.
    //    Transient failures retry HERE without re-running compile-timeline.
    const generatedInterpretation = await step.run("interpret-activity", async () => {
      const result = await generateInterpretation(compiled.timeline, compiled.intent);
      return {
        interpretation: result.data,
        model: result.model,
        tokensUsed: result.usage ? result.usage.inputTokens + result.usage.outputTokens : null,
      };
    });

    // 3. Persist Agent 1's output as an intermediate artifact -- inspectable
    //    independent of the final report, and re-analysis appends a version
    //    rather than overwriting.
    await step.run("persist-interpretation", () =>
      persistInterpretation(sessionId, compiled.userId, generatedInterpretation),
    );

    // 4. AI (Agent 2): the only step that calls a model for the final report.
    const generatedReflection = await step.run("generate-reflection", async () => {
      const result = await generateReflection(
        compiled.timeline,
        generatedInterpretation.interpretation,
        compiled.intent,
      );
      return {
        reflection: result.data,
        model: result.model,
        tokensUsed: result.usage ? result.usage.inputTokens + result.usage.outputTokens : null,
      };
    });

    // 5. Persist a new (versioned) report and mark the session complete.
    await step.run("persist-reflection", () =>
      persistReflection(sessionId, compiled.userId, generatedReflection),
    );

    return { sessionId, status: "complete" as const };
  },
);

async function persistInterpretation(
  sessionId: string,
  userId: string,
  generated: { interpretation: ActivityInterpretation; model: string; tokensUsed: number | null },
): Promise<void> {
  const service = createServiceClient();

  const { data: latest } = await service
    .from("interpretations")
    .select("version")
    .eq("session_id", sessionId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle<{ version: number }>();

  const version = (latest?.version ?? 0) + 1;

  const { error } = await service.from("interpretations").insert({
    session_id: sessionId,
    user_id: userId,
    version,
    interpretation: generated.interpretation,
    model: generated.model,
    prompt_version: INTERPRETATION_PROMPT_VERSION,
    tokens_used: generated.tokensUsed,
  });
  if (error) throw new Error(`failed to persist interpretation: ${error.message}`);
}

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
