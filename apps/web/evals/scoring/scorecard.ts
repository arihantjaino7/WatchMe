/**
 * Scorecard primitives shared by the Agent 1 and Agent 2 scorers. A check is a
 * single deterministic quality assertion; a scorecard aggregates the checks for
 * one agent on one case into a 0..1 score plus the failure/warning lists that
 * drive the report and the runner's exit code.
 */

export type CheckStatus = "pass" | "warn" | "fail";

export type CheckResult = {
  name: string;
  status: CheckStatus;
  detail: string;
};

export type Agent = "agent1" | "agent2";

export type Scorecard = {
  agent: Agent;
  checks: CheckResult[];
  score: number;
  failures: CheckResult[];
  warnings: CheckResult[];
};

export const pass = (name: string, detail = ""): CheckResult => ({ name, status: "pass", detail });
export const warn = (name: string, detail: string): CheckResult => ({
  name,
  status: "warn",
  detail,
});
export const fail = (name: string, detail: string): CheckResult => ({
  name,
  status: "fail",
  detail,
});

/** Weighted pass-rate: pass=1, warn=0.5, fail=0. Empty check list scores a clean 1. */
export function computeScore(checks: CheckResult[]): number {
  if (checks.length === 0) return 1;
  const earned = checks.reduce(
    (sum, c) => sum + (c.status === "pass" ? 1 : c.status === "warn" ? 0.5 : 0),
    0,
  );
  return Math.round((earned / checks.length) * 100) / 100;
}

export function toScorecard(agent: Agent, checks: CheckResult[]): Scorecard {
  return {
    agent,
    checks,
    score: computeScore(checks),
    failures: checks.filter((c) => c.status === "fail"),
    warnings: checks.filter((c) => c.status === "warn"),
  };
}
