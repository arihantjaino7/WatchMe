import { NextResponse } from "next/server";
import type { EndSessionResponse } from "@watchme/shared";
import { authenticateRequest } from "@/lib/api/request-auth";
import { jsonError, unauthorized } from "@/lib/api/responses";
import { SESSION_COLUMNS, sessionFromRow, type SessionRow } from "@/lib/api/session-row";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * M1-E2-T2: end a session. Ending an already-ended session is a no-op that
 * returns the session as-is (a service-worker retry after a lost response
 * must not surface as an error in the popup).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return jsonError(404, "session not found");

  const auth = await authenticateRequest(request);
  if (!auth) return unauthorized();

  const { data: ended } = await auth.supabase
    .from("sessions")
    .update({ ended_at: new Date().toISOString(), end_reason: "user" })
    .eq("id", id)
    .is("ended_at", null)
    .select(SESSION_COLUMNS)
    .maybeSingle<SessionRow>();

  if (ended) {
    return NextResponse.json({ session: sessionFromRow(ended) } satisfies EndSessionResponse);
  }

  // Nothing updated: either already ended (no-op success) or not this user's
  // session (RLS hides it -> 404).
  const { data: existing } = await auth.supabase
    .from("sessions")
    .select(SESSION_COLUMNS)
    .eq("id", id)
    .maybeSingle<SessionRow>();

  if (!existing) return jsonError(404, "session not found");
  return NextResponse.json({ session: sessionFromRow(existing) } satisfies EndSessionResponse);
}
