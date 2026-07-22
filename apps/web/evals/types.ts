import type { Category, CompiledTimeline, IntentVerdict, ProductivityLabel } from "@watchme/shared";

/**
 * A curated, synthetic evaluation case. No production user data: every timeline
 * is hand-authored from a synthetic event stream. `interpretationOutput` and
 * `reflectionOutput` are stored raw model outputs (as JSON strings, exactly what
 * a model would emit) fed to the fixture provider, so the harness scores the
 * real production pipeline against known inputs offline.
 */
export type EvalCase = {
  id: string;
  name: string;
  scenario: string;
  intent: string | null;
  timeline: CompiledTimeline;
  interpretationOutput: string;
  reflectionOutput: string;
  expected: {
    interpretation: Agent1Expectations;
    reflection: Agent2Expectations;
  };
  metadata: EvalMetadata;
};

export type Agent1Expectations = {
  minEpisodes?: number;
  maxEpisodes?: number;
  /** Categories that must appear across the episodes. */
  requiredCategories?: Category[];
  /** Domains whose episode must be flagged `isDistraction: true`. */
  requiredDistractionDomains?: string[];
  /** Domains that must NOT be flagged as a distraction (e.g. github.com in a coding session). */
  forbiddenDistractionDomains?: string[];
  /** When true, the stored output is expected to violate grounding (a negative fixture). */
  expectGroundingFailure?: boolean;
};

export type Agent2Expectations = {
  intentVerdict?: IntentVerdict;
  /** Acceptable productivity labels (any one passes). */
  productivityLabels?: ProductivityLabel[];
  minSuggestions?: number;
  /** Evidence domains the reflection must reference. */
  mustMentionDomains?: string[];
  /** Domains absent from the evidence that must NOT appear (hallucination traps). */
  mustNotMentionDomains?: string[];
  /** When true, the stored reflection is expected to fail schema validation. */
  expectSchemaFailure?: boolean;
};

export type EvalMetadata = {
  author: string;
  createdAt: string;
  tags: string[];
};
