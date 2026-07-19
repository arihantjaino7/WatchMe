import { NextResponse } from "next/server";
import {
  EventBatchRequestSchema,
  type EventBatchResponse,
  type SessionEvent,
} from "@watchme/shared";
import { authenticateRequest } from "@/lib/api/request-auth";
import { jsonError, readJson, unauthorized } from "@/lib/api/responses";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * M1-E3-T4 (server half): idempotent batch ingestion. Replays are absorbed by
 * `UNIQUE (session_id, client_event_id)` + ON CONFLICT DO NOTHING, so the
 * extension may retry a batch forever without creating duplicates. `accepted`
 * counts only newly-inserted rows.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return jsonError(404, "session not found");

  const auth = await authenticateRequest(request);
  if (!auth) return unauthorized();

  const body = await readJson(request);
  const parsed = EventBatchRequestSchema.safeParse(body);
  if (!parsed.success) return jsonError(400, "invalid request body");

  // RLS-scoped: resolves only if the session exists AND belongs to the caller.
  // Uploads to an ended session are allowed -- the final flush arrives after end.
  const { data: session } = await auth.supabase
    .from("sessions")
    .select("id")
    .eq("id", id)
    .maybeSingle<{ id: string }>();
  if (!session) return jsonError(404, "session not found");

  // A batch may contain the same event twice (client retry quirks); Postgres
  // rejects double-conflicting rows in one statement, so dedupe first.
  const seen = new Set<string>();
  const unique = parsed.data.events.filter((event) => {
    if (seen.has(event.clientEventId)) return false;
    seen.add(event.clientEventId);
    return true;
  });

  const rows = unique.map((event) => toRow(event, id, auth.user.id));

  const { data: inserted, error } = await auth.supabase
    .from("events")
    .upsert(rows, { onConflict: "session_id,client_event_id", ignoreDuplicates: true })
    .select("id");

  if (error) return jsonError(500, "failed to store events");

  await auth.supabase
    .from("sessions")
    .update({ last_event_at: new Date().toISOString() })
    .eq("id", id);

  return NextResponse.json({
    accepted: inserted?.length ?? 0,
  } satisfies EventBatchResponse);
}

function toRow(event: SessionEvent, sessionId: string, userId: string) {
  return {
    session_id: sessionId,
    user_id: userId,
    client_event_id: event.clientEventId,
    type: event.type,
    occurred_at: new Date(event.occurredAt).toISOString(),
    url: "url" in event ? event.url : null,
    title: "title" in event ? event.title : null,
    domain: "domain" in event ? event.domain : null,
    duration_ms: event.type === "redacted" ? event.durationMs : null,
    source: event.source,
  };
}
