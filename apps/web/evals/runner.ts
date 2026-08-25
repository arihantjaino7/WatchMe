import { INTERPRETATION_PROMPT_VERSION, REFLECTION_PROMPT_VERSION } from "@watchme/shared";
import { generateInterpretation } from "../lib/pipeline/interpret";
import { generateReflection } from "../lib/pipeline/reflect";
import { fixtureProvider } from "./provider";
import { scoreInterpretation, type Agent1Outcome } from "./scoring/agent1";
import { scoreReflection, type Agent2Outcome } from "./scoring/agent2";
import type { Scorecard } from "./scoring/scorecard";
import type { EvalCase } from "./types";

/**
 * Runs curated cases through the REAL production pipeline functions with a
 * fixture provider (offline, deterministic) and scores the output. `maxAttempts:
 * 1` means a bad stored output fails immediately rather than re-prompting the
 * (identical) fixture. The whole thing is pure given the fixtures.
 */

const PROVIDER_NAME = "fixture";

export type VersionInfo = {
  model: string;
  provider: string;
  interpretationPromptVersion: string;
  reflectionPromptVersion: string;
  compilerVersion: number;
};

export type CaseResult = {
  id: string;
  name: string;
  agent1: Scorecard;
  agent2: Scorecard;
  versions: VersionInfo;
};

export type RunResult = {
  cases: CaseResult[];
  totals: { agent1: number; agent2: number; failures: number; warnings: number };
  ok: boolean;
};

export async function runCase(evalCase: EvalCase): Promise<CaseResult> {
  let a1: Agent1Outcome;
  let interpretModel = "unknown";
  try {
    const res = await generateInterpretation(evalCase.timeline, evalCase.intent, {
      provider: fixtureProvider(evalCase.interpretationOutput, PROVIDER_NAME),
      maxAttempts: 1,
    });
    a1 = { ok: true, interpretation: res.data };
    interpretModel = res.model;
  } catch (err) {
    a1 = { ok: false, error: errorMessage(err) };
  }
  const agent1 = scoreInterpretation(evalCase, a1);

  const interpretationForReflection = a1.ok ? a1.interpretation : null;
  let a2: Agent2Outcome;
  let reflectModel = "unknown";
  if (interpretationForReflection) {
    try {
      const res = await generateReflection(
        evalCase.timeline,
        interpretationForReflection,
        evalCase.intent,
        { provider: fixtureProvider(evalCase.reflectionOutput, PROVIDER_NAME), maxAttempts: 1 },
      );
      a2 = { ok: true, reflection: res.data };
      reflectModel = res.model;
    } catch (err) {
      a2 = { ok: false, error: errorMessage(err) };
    }
  } else {
    a2 = { ok: false, error: "skipped: interpretation failed" };
  }
  const agent2 = scoreReflection(evalCase, a2);

  return {
    id: evalCase.id,
    name: evalCase.name,
    agent1,
    agent2,
    versions: {
      model: interpretModel !== "unknown" ? interpretModel : reflectModel,
      provider: PROVIDER_NAME,
      interpretationPromptVersion: INTERPRETATION_PROMPT_VERSION,
      reflectionPromptVersion: REFLECTION_PROMPT_VERSION,
      compilerVersion: evalCase.timeline.compilerVersion,
    },
  };
}

export async function runAll(cases: EvalCase[]): Promise<RunResult> {
  const results: CaseResult[] = [];
  for (const evalCase of cases) results.push(await runCase(evalCase));

  const failures = results.reduce(
    (sum, r) => sum + r.agent1.failures.length + r.agent2.failures.length,
    0,
  );
  const warnings = results.reduce(
    (sum, r) => sum + r.agent1.warnings.length + r.agent2.warnings.length,
    0,
  );

  return {
    cases: results,
    totals: {
      agent1: mean(results.map((r) => r.agent1.score)),
      agent2: mean(results.map((r) => r.agent2.score)),
      failures,
      warnings,
    },
    ok: failures === 0,
  };
}

function mean(values: number[]): number {
  if (values.length === 0) return 1;
  return Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 100) / 100;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
