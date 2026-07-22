import {
  buildGroundedInterpretationSchema,
  type ActivityInterpretation,
  type CompiledTimeline,
} from "@watchme/shared";
import type { EvalCase } from "../types";
import { fail, pass, toScorecard, warn, type CheckResult, type Scorecard } from "./scorecard";
import { parseModelJson } from "./json";

/**
 * Scores an Agent 1 (Activity Interpreter) result. Two layers:
 *  1. Grounding — the raw stored output is parsed against the REAL grounding
 *     schema, and any issue is categorized (invalid index / duplicate / non-
 *     activity). This is the production guarantee, measured directly.
 *  2. Quality — on a valid interpretation: episode count, domain cohesion,
 *     category accuracy, title quality, and distraction detection.
 */

/** Domains the compiler's static map deliberately leaves ambiguous (title decides). */
const AMBIGUOUS_DOMAINS = new Set(["youtube.com", "twitter.com", "x.com", "reddit.com"]);

/** Labels too generic to count as real semantic interpretation. */
const GENERIC_LABELS = new Set([
  "coding",
  "working",
  "work",
  "browsing",
  "activity",
  "docs",
  "documentation",
  "research",
  "other",
  "session",
]);

export type Agent1Outcome =
  { ok: true; interpretation: ActivityInterpretation } | { ok: false; error: string };

export function scoreInterpretation(evalCase: EvalCase, outcome: Agent1Outcome): Scorecard {
  const checks: CheckResult[] = [];
  const { blocks } = evalCase.timeline;
  const exp = evalCase.expected.interpretation;

  // Grounding, measured directly against the raw stored output.
  const raw = parseModelJson(evalCase.interpretationOutput);
  const grounded = buildGroundedInterpretationSchema(blocks).safeParse(raw);
  const issues = grounded.success ? [] : grounded.error.issues.map((i) => i.message);

  if (exp.expectGroundingFailure) {
    checks.push(
      grounded.success
        ? fail(
            "grounding.expected_failure",
            "output was expected to violate grounding but validated",
          )
        : pass("grounding.expected_failure", "grounding correctly rejected the output"),
    );
    return toScorecard("agent1", checks);
  }

  checks.push(
    grounded.success ? pass("grounding.valid") : fail("grounding.valid", issues.join("; ")),
  );
  checks.push(
    hasIssue(issues, "no block at index")
      ? fail("grounding.no_invalid_index", "cites a nonexistent block")
      : pass("grounding.no_invalid_index"),
  );
  checks.push(
    hasIssue(issues, "already used")
      ? fail("grounding.no_duplicate_index", "reuses a block across episodes")
      : pass("grounding.no_duplicate_index"),
  );
  checks.push(
    hasIssue(issues, 'not "activity"')
      ? fail("grounding.no_nonactivity", "cites an idle/redacted block")
      : pass("grounding.no_nonactivity"),
  );

  if (!outcome.ok) return toScorecard("agent1", checks);
  const interp = outcome.interpretation;

  if (exp.minEpisodes !== undefined || exp.maxEpisodes !== undefined) {
    const n = interp.episodes.length;
    const lo = exp.minEpisodes ?? 0;
    const hi = exp.maxEpisodes ?? Number.POSITIVE_INFINITY;
    checks.push(
      n >= lo && n <= hi
        ? pass("episode.count", `${n} episodes`)
        : fail("episode.count", `expected ${lo}..${hi}, got ${n}`),
    );
  }

  checks.push(scoreGrouping(interp, evalCase.timeline));
  checks.push(scoreCategoryAccuracy(interp, evalCase.timeline));
  checks.push(scoreTitleQuality(interp));

  if (exp.requiredCategories?.length) {
    const present = new Set(interp.episodes.map((e) => e.category));
    const missing = exp.requiredCategories.filter((c) => !present.has(c));
    checks.push(
      missing.length === 0
        ? pass("category.required", exp.requiredCategories.join(", "))
        : fail("category.required", `missing ${missing.join(", ")}`),
    );
  }

  checks.push(...scoreDistraction(interp, evalCase.timeline, evalCase));

  return toScorecard("agent1", checks);
}

const hasIssue = (issues: string[], needle: string): boolean =>
  issues.some((m) => m.includes(needle));

/** A domain's activity blocks should belong to one episode, not be scattered. */
function scoreGrouping(interp: ActivityInterpretation, timeline: CompiledTimeline): CheckResult {
  const byDomain = new Map<string, Set<number>>();
  interp.episodes.forEach((episode, episodeIdx) => {
    for (const blockIdx of episode.blockIndices) {
      const domain = timeline.blocks[blockIdx]?.domain;
      if (!domain) continue;
      if (!byDomain.has(domain)) byDomain.set(domain, new Set());
      byDomain.get(domain)!.add(episodeIdx);
    }
  });
  const split = [...byDomain.entries()].filter(([, set]) => set.size > 1).map(([d]) => d);
  return split.length === 0
    ? pass("grouping.domain_cohesion")
    : warn("grouping.domain_cohesion", `split across episodes: ${split.join(", ")}`);
}

/** Each episode's category should match the dominant cited-block category (ambiguous domains excused). */
function scoreCategoryAccuracy(
  interp: ActivityInterpretation,
  timeline: CompiledTimeline,
): CheckResult {
  const mismatches: string[] = [];
  for (const episode of interp.episodes) {
    const cited = episode.blockIndices.map((i) => timeline.blocks[i]).filter(isDefined);
    const ambiguous = cited.some((b) => b.domain !== null && AMBIGUOUS_DOMAINS.has(b.domain));
    if (ambiguous) continue;
    const dominant = modeCategory(cited.map((b) => b.category).filter(isDefined));
    if (dominant && episode.category !== dominant) {
      mismatches.push(`"${episode.label}" is ${episode.category}, blocks are ${dominant}`);
    }
  }
  return mismatches.length === 0
    ? pass("category.accuracy")
    : fail("category.accuracy", mismatches.join("; "));
}

function scoreTitleQuality(interp: ActivityInterpretation): CheckResult {
  const weak = interp.episodes.filter(
    (e) => GENERIC_LABELS.has(e.label.toLowerCase().trim()) || e.label.trim().length < 8,
  );
  return weak.length === 0
    ? pass("title.quality")
    : warn("title.quality", `weak labels: ${weak.map((e) => e.label).join(", ")}`);
}

function scoreDistraction(
  interp: ActivityInterpretation,
  timeline: CompiledTimeline,
  evalCase: EvalCase,
): CheckResult[] {
  const exp = evalCase.expected.interpretation;
  const flagged = new Set<string>();
  for (const episode of interp.episodes) {
    if (!episode.isDistraction) continue;
    for (const i of episode.blockIndices) {
      const domain = timeline.blocks[i]?.domain;
      if (domain) flagged.add(domain);
    }
  }

  const out: CheckResult[] = [];
  if (exp.requiredDistractionDomains?.length) {
    const missing = exp.requiredDistractionDomains.filter((d) => !flagged.has(d));
    out.push(
      missing.length === 0
        ? pass("distraction.detected", exp.requiredDistractionDomains.join(", "))
        : fail("distraction.detected", `not flagged: ${missing.join(", ")}`),
    );
  }
  if (exp.forbiddenDistractionDomains?.length) {
    const wrong = exp.forbiddenDistractionDomains.filter((d) => flagged.has(d));
    out.push(
      wrong.length === 0
        ? pass("distraction.no_false_positive")
        : fail("distraction.no_false_positive", `wrongly flagged: ${wrong.join(", ")}`),
    );
  }
  return out;
}

function modeCategory(values: string[]): string | null {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: string | null = null;
  let bestCount = 0;
  for (const [v, c] of counts) {
    if (c > bestCount) {
      best = v;
      bestCount = c;
    }
  }
  return best;
}

function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}
