import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { StartSessionRequestSchema, type StartSessionResponse } from "@watchme/shared";
import { authenticateRequest } from "@/lib/api/request-auth";
import { jsonError, readJson, unauthorized } from "@/lib/api/responses";
import { SESSION_COLUMNS, sessionFromRow, type SessionRow } from "@/lib/api/session-row";

/**
 * M1-E2-T1: start a session. Idempotent by design -- if the user already has
 * an active session, return it with `reused: true` instead of erroring, so a
 * popup/service-worker retry can never wedge the extension.
 */
export async function POST(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth) return unauthorized();

  const body = (await readJson(request)) ?? {};
  const parsed = StartSessionRequestSchema.safeParse(body);
  if (!parsed.success) return jsonError(400, "invalid request body");

  const active = await fetchActive(auth.supabase);
  if (active) {
    return NextResponse.json({
      session: sessionFromRow(active),
      reused: true,
    } satisfies StartSessionResponse);
  }

  const { data: created, error } = await auth.supabase
    .from("sessions")
    .insert({ user_id: auth.user.id, intent: parsed.data.intent ?? null })
    .select(SESSION_COLUMNS)
    .single<SessionRow>();

  if (error) {
    // 23505 = the partial unique index fired: another request won the race to
    // create the active session. Return the winner.
    if (error.code === "23505") {
      const raced = await fetchActive(auth.supabase);
      if (raced) {
        return NextResponse.json({
          session: sessionFromRow(raced),
          reused: true,
        } satisfies StartSessionResponse);
      }
    }
    return jsonError(500, "failed to start session");
  }

  return NextResponse.json(
    { session: sessionFromRow(created), reused: false } satisfies StartSessionResponse,
    { status: 201 },
  );
}

async function fetchActive(supabase: SupabaseClient) {
  const { data } = await supabase
    .from("sessions")
    .select(SESSION_COLUMNS)
    .is("ended_at", null)
    .maybeSingle<SessionRow>();
  return data;
}
