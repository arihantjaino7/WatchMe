import type { CompiledTimeline, Reflection } from "@watchme/shared";
import { toTimelineMetrics } from "../../lib/pipeline/metrics";
import type { EvalCase } from "../types";
import { extractDomains } from "./domains";
import { fail, pass, toScorecard, warn, type CheckResult, type Scorecard } from "./scorecard";

/**
 * Scores an Agent 2 (Reflection Analyst) result: schema validity plus grounding
 * and internal consistency. The central rule -- "the reflection must never
 * reference facts absent from the interpretation or deterministic metrics" -- is
 * enforced by scanning every free-text field for domain mentions and rejecting
 * any domain not present in the session's evidence. Evidence domains come from
 * the compiled timeline, which is a superset of what Agent 1's (grounded)
 * interpretation could reference, so it covers "absent from the interpretation
 * or the deterministic metrics".
 */

const GENERIC_SUGGESTIONS = [
  "work harder",
  "stay focused",
  "be more productive",
  "take breaks",
  "focus more",
  "avoid distractions",
];

export type Agent2Outcome = { ok: true; reflection: Reflection } | { ok: false; error: string };

export function scoreReflection(evalCase: EvalCase, outcome: Agent2Outcome): Scorecard {
  const checks: CheckResult[] = [];
  const exp = evalCase.expected.reflection;

  if (exp.expectSchemaFailure) {
    checks.push(
      outcome.ok
        ? fail("schema.expected_failure", "reflection was expected to be invalid but validated")
        : pass("schema.expected_failure", "invalid reflection correctly rejected"),
    );
    return toScorecard("agent2", checks);
  }

  checks.push(
    outcome.ok ? pass("schema.valid") : fail("schema.valid", outcome.ok ? "" : outcome.error),
  );
  if (!outcome.ok) return toScorecard("agent2", checks);

  const r = outcome.reflection;
  const evidenceDomains = evidenceDomainSet(evalCase.timeline);
  const textFields = [
    r.narrative,
    r.productivity.assessment,
    r.distraction.summary,
    r.focus.strongest,
    r.focus.weakest,
    r.intent.assessment,
    ...r.observations,
    ...r.suggestions,
  ];
  const allText = textFields.join("  ");

  // Hallucination: any domain mentioned that is not in the evidence.
  const unknown = extractDomains(allText).filter((d) => !evidenceDomains.has(d));
  checks.push(
    unknown.length === 0
      ? pass("hallucination.domains")
      : fail(
          "hallucination.domains",
          `references domains absent from evidence: ${unknown.join(", ")}`,
        ),
  );

  // Distraction sources must be real evidence domains.
  const ungrounded = r.distraction.sources.filter((d) => !evidenceDomains.has(d));
  checks.push(
    ungrounded.length === 0
      ? pass("evidence.distraction_sources")
      : fail("evidence.distraction_sources", `ungrounded sources: ${ungrounded.join(", ")}`),
  );

  if (exp.mustMentionDomains?.length) {
    const missing = exp.mustMentionDomains.filter((d) => !allText.includes(d));
    checks.push(
      missing.length === 0
        ? pass("evidence.usage", exp.mustMentionDomains.join(", "))
        : warn("evidence.usage", `did not reference ${missing.join(", ")}`),
    );
  }

  if (exp.mustNotMentionDomains?.length) {
    const present = exp.mustNotMentionDomains.filter((d) => allText.includes(d));
    checks.push(
      present.length === 0
        ? pass("hallucination.trap")
        : fail("hallucination.trap", `mentioned absent domains: ${present.join(", ")}`),
    );
  }

  checks.push(scoreIntentConsistency(evalCase, r));
  checks.push(scoreProductivityConsistency(evalCase.timeline, r));

  if (exp.intentVerdict) {
    checks.push(
      r.intent.verdict === exp.intentVerdict
        ? pass("intent.verdict", r.intent.verdict)
        : fail("intent.verdict", `expected ${exp.intentVerdict}, got ${r.intent.verdict}`),
    );
  }
  if (exp.productivityLabels?.length) {
    checks.push(
      exp.productivityLabels.includes(r.productivity.label)
        ? pass("productivity.label", r.productivity.label)
        : fail(
            "productivity.label",
            `expected ${exp.productivityLabels.join("|")}, got ${r.productivity.label}`,
          ),
    );
  }

  checks.push(scoreSuggestions(r));
  checks.push(scoreNarrative(r, evidenceDomains));

  return toScorecard("agent2", checks);
}

function evidenceDomainSet(timeline: CompiledTimeline): Set<string> {
  const set = new Set<string>();
  for (const block of timeline.blocks) if (block.domain) set.add(block.domain);
  return set;
}

/** Null intent must yield verdict `no_intent`; a declared intent must not. */
function scoreIntentConsistency(evalCase: EvalCase, r: Reflection): CheckResult {
  const hasIntent = evalCase.intent !== null && evalCase.intent.trim().length > 0;
  if (!hasIntent && r.intent.verdict !== "no_intent") {
    return fail("consistency.intent", `no intent declared but verdict is "${r.intent.verdict}"`);
  }
  if (hasIntent && r.intent.verdict === "no_intent") {
    return fail("consistency.intent", "intent was declared but verdict is no_intent");
  }
  return pass("consistency.intent");
}

/** A "high" label with almost no focus, or "low" with heavy focus, is a contradiction. */
function scoreProductivityConsistency(timeline: CompiledTimeline, r: Reflection): CheckResult {
  const { focusPercentage } = toTimelineMetrics(timeline);
  if (r.productivity.label === "high" && focusPercentage < 40) {
    return warn("consistency.productivity", `label high but focus is ${focusPercentage}%`);
  }
  if (r.productivity.label === "low" && focusPercentage >= 80) {
    return warn("consistency.productivity", `label low but focus is ${focusPercentage}%`);
  }
  return pass("consistency.productivity");
}

function scoreSuggestions(r: Reflection): CheckResult {
  const weak = r.suggestions.filter((s) => {
    const t = s.toLowerCase().trim();
    return t.length < 20 || GENERIC_SUGGESTIONS.some((g) => t === g);
  });
  return weak.length === 0
    ? pass("suggestion.quality", `${r.suggestions.length} concrete suggestion(s)`)
    : warn("suggestion.quality", `generic suggestions: ${weak.join(" | ")}`);
}

/** The narrative should cite at least one real evidence domain. */
function scoreNarrative(r: Reflection, evidenceDomains: Set<string>): CheckResult {
  const cited = extractDomains(r.narrative).filter((d) => evidenceDomains.has(d));
  return cited.length > 0
    ? pass("narrative.grounded", cited.join(", "))
    : warn("narrative.grounded", "narrative cites no specific evidence domain");
}
