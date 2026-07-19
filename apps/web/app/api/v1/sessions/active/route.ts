import { NextResponse } from "next/server";
import type { ActiveSessionResponse } from "@watchme/shared";
import { authenticateRequest } from "@/lib/api/request-auth";
import { unauthorized } from "@/lib/api/responses";
import { SESSION_COLUMNS, sessionFromRow, type SessionRow } from "@/lib/api/session-row";

/**
 * M1-E2-T3: recovery endpoint. The service worker calls this on every wake to
 * reconcile its stored state with the truth -- `null` means "no active
 * session", which is a normal answer, not an error.
 */
export async function GET(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth) return unauthorized();

  const { data } = await auth.supabase
    .from("sessions")
    .select(SESSION_COLUMNS)
    .is("ended_at", null)
    .maybeSingle<SessionRow>();

  return NextResponse.json({
    session: data ? sessionFromRow(data) : null,
  } satisfies ActiveSessionResponse);
}
