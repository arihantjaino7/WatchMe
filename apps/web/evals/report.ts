import type { CaseResult, RunResult } from "./runner";
import type { CheckResult } from "./scoring/scorecard";

/**
 * Renders a RunResult as a concise, human-readable text report: a version
 * header (so runs are comparable across prompt/model changes), a per-case
 * scorecard table with totals, a details section for every failure/warning,
 * and a final PASS/FAIL line matching the runner's exit code.
 */

const NAME_W = 30;
const NUM_W = 6;

export function formatReport(run: RunResult): string {
  const lines: string[] = [];
  lines.push("WatchMe AI — Evaluation Report");

  const v = run.cases[0]?.versions;
  if (v) {
    lines.push(
      `model=${v.model}  provider=${v.provider}  compiler=v${v.compilerVersion}  ` +
        `interpret=${v.interpretationPromptVersion}  reflect=${v.reflectionPromptVersion}`,
    );
  }
  lines.push("");
  lines.push(row("Case", "A1", "A2", "Fail", "Warn"));
  lines.push(divider());

  for (const c of run.cases) {
    lines.push(
      row(
        c.name,
        fmt(c.agent1.score),
        fmt(c.agent2.score),
        String(c.agent1.failures.length + c.agent2.failures.length),
        String(c.agent1.warnings.length + c.agent2.warnings.length),
      ),
    );
  }

  lines.push(divider());
  lines.push(
    row(
      "TOTALS",
      fmt(run.totals.agent1),
      fmt(run.totals.agent2),
      String(run.totals.failures),
      String(run.totals.warnings),
    ),
  );

  const details = run.cases.flatMap(collectDetails);
  if (details.length > 0) {
    lines.push("", "Details:");
    lines.push(...details);
  }

  lines.push("", run.ok ? "RESULT: PASS" : "RESULT: FAIL");
  return lines.join("\n");
}

function collectDetails(c: CaseResult): string[] {
  const line = (agent: string, check: CheckResult): string =>
    `  [${check.status.toUpperCase()}] ${c.id} · ${agent} · ${check.name}${
      check.detail ? ` — ${check.detail}` : ""
    }`;
  return [
    ...c.agent1.failures.map((f) => line("A1", f)),
    ...c.agent2.failures.map((f) => line("A2", f)),
    ...c.agent1.warnings.map((w) => line("A1", w)),
    ...c.agent2.warnings.map((w) => line("A2", w)),
  ];
}

const row = (name: string, a1: string, a2: string, fail: string, warn: string): string =>
  pad(name, NAME_W) + pad(a1, NUM_W) + pad(a2, NUM_W) + pad(fail, NUM_W) + pad(warn, NUM_W);

const divider = (): string => "-".repeat(NAME_W + NUM_W * 4);

const fmt = (score: number): string => score.toFixed(2);

const pad = (s: string, width: number): string =>
  s.length >= width ? `${s.slice(0, width - 1)} ` : s + " ".repeat(width - s.length);
