import Link from "next/link";
import { notFound } from "next/navigation";
import type { Reflection } from "@watchme/shared";
import { createClient } from "@/lib/supabase/server";
import { SESSION_COLUMNS, sessionFromRow, type SessionRow } from "@/lib/api/session-row";
import { CATEGORY_LABEL, formatDuration, formatSessionDate } from "@/lib/format";
import { retryAnalysis } from "./actions";

type ReportRow = { reflection: Reflection; model: string; created_at: string };

export default async function SessionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: row } = await supabase
    .from("sessions")
    .select(SESSION_COLUMNS)
    .eq("id", id)
    .maybeSingle<SessionRow>();

  if (!row) notFound();
  const session = sessionFromRow(row);

  const { data: report } = await supabase
    .from("reports")
    .select("reflection, model, created_at")
    .eq("session_id", id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle<ReportRow>();

  const stats = session.stats;

  return (
    <>
      <header className="shell-header">
        <span className="wm-wordmark">
          WatchMe<span className="dot">.</span>
        </span>
        <Link
          href="/"
          className="wm-btn wm-btn--ghost"
          style={{ padding: "0.4rem 1rem", fontSize: "0.82rem" }}
        >
          ← Sessions
        </Link>
      </header>

      <main className="shell-main">
        <span className="wm-kicker wm-rise">
          {formatSessionDate(session.startedAt)}
          {session.endedAt ? ` – ended ${formatSessionDate(session.endedAt)}` : " · in progress"}
        </span>
        <h1 className="wm-rise wm-rise-2">{session.intent ?? "Untitled session"}</h1>

        {stats ? (
          <>
            <div className="session-stat-row wm-rise wm-rise-3">
              <Stat label="Total time" value={formatDuration(stats.totalDurationMs)} />
              <Stat label="Focus time" value={formatDuration(stats.focusDurationMs)} />
              <Stat label="Focus %" value={`${Math.round(stats.focusPercentage)}%`} />
              <Stat label="Context switches" value={String(stats.contextSwitches)} />
              <Stat label="Longest focus block" value={formatDuration(stats.longestFocusBlockMs)} />
            </div>

            <section className="wm-rise wm-rise-4">
              <span className="wm-kicker">Timeline</span>
              <div className="timeline-bar" role="img" aria-label="Session timeline">
                {stats.blocks.map((block, i) => (
                  <span
                    key={i}
                    className={`timeline-block timeline-block--${block.kind}${block.isFocus ? " timeline-block--focus" : ""}`}
                    data-category={block.category ?? undefined}
                    style={{ flexGrow: Math.max(block.durationMs, 1) }}
                    title={`${block.title ?? block.domain ?? block.kind} · ${formatDuration(block.durationMs)}`}
                  />
                ))}
              </div>
            </section>

            {stats.appUsage.length > 0 && (
              <section className="usage-section wm-rise wm-rise-4">
                <span className="wm-kicker">Where the time went</span>
                <div className="usage-bars">
                  {[...stats.appUsage]
                    .sort((a, b) => b.durationMs - a.durationMs)
                    .map((usage) => (
                      <div className="usage-bar-row" key={usage.category}>
                        <span className="usage-bar-label">{CATEGORY_LABEL[usage.category]}</span>
                        <div className="usage-bar-track">
                          <div
                            className="usage-bar-fill"
                            data-category={usage.category}
                            style={{ width: `${usage.percentage}%` }}
                          />
                        </div>
                        <span className="usage-bar-value">{Math.round(usage.percentage)}%</span>
                      </div>
                    ))}
                </div>
              </section>
            )}
          </>
        ) : (
          <p className="shell-sub wm-rise wm-rise-3">
            This session hasn&apos;t been compiled into a timeline yet.
          </p>
        )}

        <section className="report-section wm-rise wm-rise-4">
          <span className="wm-kicker">Reflection</span>
          <ReportBody
            status={session.analysisStatus}
            report={report?.reflection ?? null}
            sessionId={session.id}
          />
        </section>
      </main>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="session-stat">
      <span className="session-stat-value">{value}</span>
      <span className="session-stat-label">{label}</span>
    </div>
  );
}

function ReportBody({
  status,
  report,
  sessionId,
}: {
  status: string;
  report: Reflection | null;
  sessionId: string;
}) {
  if (status === "pending") {
    return <p className="status-banner status-banner--pending">Queued for analysis.</p>;
  }
  if (status === "running") {
    return <p className="status-banner status-banner--running">Analyzing this session…</p>;
  }
  if (status === "failed") {
    return (
      <div className="status-banner status-banner--failed">
        <p>Analysis failed. The timeline above is unaffected.</p>
        <form action={retryAnalysis.bind(null, sessionId)}>
          <button className="wm-btn wm-btn--ghost" type="submit">
            Retry analysis
          </button>
        </form>
      </div>
    );
  }
  if (!report) {
    return <p className="status-banner">No reflection yet.</p>;
  }

  return (
    <div className="report-card">
      <p className="report-narrative">{report.narrative}</p>

      <div className="report-grid">
        <div className="report-block">
          <span className="wm-kicker">
            Productivity · {report.productivity.label} ({report.productivity.score})
          </span>
          <p>{report.productivity.assessment}</p>
        </div>

        <div className="report-block">
          <span className="wm-kicker">Focus</span>
          <p>
            <strong>Strongest:</strong> {report.focus.strongest}
          </p>
          <p>
            <strong>Weakest:</strong> {report.focus.weakest}
          </p>
        </div>

        <div className="report-block">
          <span className="wm-kicker">Distractions</span>
          <p>{report.distraction.summary}</p>
          {report.distraction.sources.length > 0 && (
            <p className="report-sources">{report.distraction.sources.join(", ")}</p>
          )}
        </div>

        <div className="report-block">
          <span className="wm-kicker">
            Intent vs. reality · {report.intent.verdict.replace("_", " ")}
          </span>
          <p>{report.intent.assessment}</p>
        </div>
      </div>

      {report.observations.length > 0 && (
        <div className="report-block">
          <span className="wm-kicker">Observations</span>
          <ul>
            {report.observations.map((o, i) => (
              <li key={i}>{o}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="report-block">
        <span className="wm-kicker">Suggestions</span>
        <ul>
          {report.suggestions.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
