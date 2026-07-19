import type { Session } from "@watchme/shared";

/** Shape of a public.sessions row as returned by PostgREST. */
export type SessionRow = {
  id: string;
  user_id: string;
  intent: string | null;
  started_at: string;
  ended_at: string | null;
  end_reason: Session["endReason"];
  analysis_status: Session["analysisStatus"];
  stats: Record<string, unknown> | null;
};

/**
 * DB row -> shared contract. Timestamps are re-serialized through Date because
 * PostgREST emits `+00:00` offsets while the contract requires strict ISO `Z`.
 */
export function sessionFromRow(row: SessionRow): Session {
  return {
    id: row.id,
    userId: row.user_id,
    intent: row.intent,
    startedAt: new Date(row.started_at).toISOString(),
    endedAt: row.ended_at ? new Date(row.ended_at).toISOString() : null,
    endReason: row.end_reason,
    analysisStatus: row.analysis_status,
    stats: row.stats,
  };
}

export const SESSION_COLUMNS =
  "id, user_id, intent, started_at, ended_at, end_reason, analysis_status, stats";
