import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { CATEGORY_LABEL, formatDuration, formatSessionDate } from "@/lib/format";
import { SESSION_COLUMNS, sessionFromRow, type SessionRow } from "@/lib/api/session-row";
import { signOut } from "./actions";

const ANALYSIS_LABEL: Record<string, string> = {
  pending: "Queued",
  running: "Analyzing",
  complete: "Reflected",
  failed: "Failed",
};

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: rows } = await supabase
    .from("sessions")
    .select(SESSION_COLUMNS)
    .order("started_at", { ascending: false })
    .limit(30)
    .returns<SessionRow[]>();

  const sessions = (rows ?? []).map(sessionFromRow);

  return (
    <>
      <header className="shell-header">
        <span className="wm-wordmark">
          WatchMe<span className="dot">.</span>
        </span>
        <div className="shell-user">
          <span>{user?.email}</span>
          <form action={signOut}>
            <button
              className="wm-btn wm-btn--ghost"
              type="submit"
              style={{ padding: "0.4rem 1rem", fontSize: "0.82rem" }}
            >
              Sign out
            </button>
          </form>
        </div>
      </header>

      <main className="shell-main">
        <span className="wm-kicker wm-rise">Sessions</span>
        <h1 className="wm-rise wm-rise-2">Your work, reflected.</h1>
        <p className="shell-sub wm-rise wm-rise-3">
          Every session you run becomes an honest account of where your attention went — and whether
          it went where you intended.
        </p>

        {sessions.length === 0 ? (
          <div className="empty-session-card wm-rise wm-rise-4">
            <span className="wm-kicker">No sessions yet</span>
            <h2>Run your first session.</h2>
            <p>
              Sessions are recorded by the WatchMe Chrome extension, only while you have one
              running.
            </p>
            <ol className="empty-session-steps">
              <li>Install the WatchMe extension.</li>
              <li>Click it, declare what you intend to do, and press start.</li>
              <li>Work. End the session. Read the reflection here.</li>
            </ol>
          </div>
        ) : (
          <ul className="session-list wm-rise wm-rise-4">
            {sessions.map((session) => {
              const topCategory = session.stats?.appUsage
                ? [...session.stats.appUsage].sort((a, b) => b.durationMs - a.durationMs)[0]
                : null;
              const durationMs = session.stats?.totalDurationMs ?? null;

              return (
                <li key={session.id}>
                  <Link href={`/sessions/${session.id}`} className="session-row">
                    <span className="session-row-date">{formatSessionDate(session.startedAt)}</span>
                    <span className="session-row-intent">
                      {session.intent ?? "Untitled session"}
                    </span>
                    <span className="session-row-meta">
                      {durationMs !== null ? formatDuration(durationMs) : "—"}
                      {session.stats
                        ? ` · ${Math.round(session.stats.focusPercentage)}% focus`
                        : ""}
                      {topCategory ? ` · ${CATEGORY_LABEL[topCategory.category]}` : ""}
                    </span>
                    <span className={`session-row-status status-${session.analysisStatus}`}>
                      {ANALYSIS_LABEL[session.analysisStatus] ?? session.analysisStatus}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        <p className="shell-footnote">
          Nothing is captured outside an active session · blocklisted domains are redacted on your
          device
        </p>
      </main>
    </>
  );
}
