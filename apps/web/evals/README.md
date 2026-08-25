# AI Evaluation Harness (Agent 1 & Agent 2)

A deterministic, **offline** regression suite that scores the quality of the Activity Interpreter
(Agent 1) and the Reflection Analyst (Agent 2). It exists so that a future prompt or model change can
be _shown_ to improve or degrade output instead of guessed at.

## How it works

Each curated case pairs a synthetic session (a real `CompiledTimeline`, built by the actual compiler
from a hand-authored event stream) with **stored model outputs**. The runner feeds those outputs
through the **real production pipeline functions** — `generateInterpretation` and `generateReflection`
— via an injected fixture provider, so the harness exercises the real prompts, the real grounding
schema, and the real `complete()` validation/retry logic. No network, no LLM key, no database. The
only thing replaced is the model itself (by a fixed string), so every run is deterministic.

```
EvalCase (timeline + stored outputs + expectations)
        │
        ├─ generateInterpretation(timeline, intent, { provider: fixture }) ──► scoreInterpretation ─► Agent 1 scorecard
        │
        └─ generateReflection(timeline, interpretation, intent, { provider: fixture }) ─► scoreReflection ─► Agent 2 scorecard
                                                                                                      │
                                                                                      runAll ─► RunResult ─► formatReport
```

## Running

```bash
pnpm eval            # from repo root: prints the report, exits non-zero on any failure (CI-suitable)
pnpm --filter @watchme/web test   # runs the harness's own unit tests + the curated baseline
```

## What is scored

**Agent 1 (`scoring/agent1.ts`)** — grounding correctness (invalid / duplicate / non-activity block
references, checked against the real `buildGroundedInterpretationSchema`), episode count, domain
cohesion (a domain's blocks shouldn't be split across episodes), category accuracy (episode category
vs. the dominant cited-block category, excusing the deliberately-ambiguous domains), title quality,
and distraction detection (required flagged / forbidden not flagged).

**Agent 2 (`scoring/agent2.ts`)** — schema validity; **hallucination detection** (every free-text
field is scanned for domain mentions; any domain not in the session's evidence fails — this enforces
"the reflection must never reference facts absent from the interpretation or deterministic metrics");
grounded distraction sources; evidence usage; intent-verdict contradiction (null intent ⇒ verdict must
be `no_intent`); productivity-vs-focus% consistency; suggestion quality; and narrative grounding.

Each check is `pass` (1.0), `warn` (0.5), or `fail` (0.0). A scorecard's score is the weighted mean; a
case fails the run if it has any `fail`, and the runner exits non-zero iff any case fails.

## Version tracking

Every run records `model`, `provider`, `interpretationPromptVersion`, `reflectionPromptVersion`, and
`compilerVersion` (see the report header). These make two runs directly comparable across a change.

## Comparing across prompt/model changes

1. Run `pnpm eval` on the current baseline and note the header + per-case A1/A2 scores.
2. Make the change (edit a prompt in `lib/pipeline/*-prompt.ts`, bump its `*_PROMPT_VERSION`, or
   point `TASK_CONFIG` at a new model in `lib/llm/index.ts`). For a change that alters expected model
   output, update the affected case's stored output.
3. Re-run `pnpm eval`. The header shows the new versions; the score columns show the delta. A prompt
   that regresses grounding, hallucination, or a consistency check drops the relevant case's score and
   turns the run red. An improvement shows up as fewer failures/warnings or higher scores.

Because everything but the stored model output is deterministic, any score change is attributable to
the change under test — that is the whole point.

## Example report

```
WatchMe AI — Evaluation Report
model=gemini-2.0-flash  provider=fixture  compiler=v1  interpret=interpret-v1-2026-07-22  reflect=reflect-v1-2026-07-22

Case                          A1    A2    Fail  Warn
------------------------------------------------------
Deep focused coding           1.00  1.00  0     0
Documentation-heavy work      1.00  1.00  0     0
Debugging session             1.00  1.00  0     0
Research-heavy browsing       1.00  1.00  0     0
Highly distracted session     1.00  1.00  0     0
Short interrupted session     1.00  1.00  0     0
Mixed productive/unproductive 1.00  1.00  0     0
------------------------------------------------------
TOTALS                        1.00  1.00  0     0

RESULT: PASS
```

## Layout

```
evals/
  cases/            synthetic sessions (no production data) + the timeline/output builder
  scoring/          scorecard primitives + the Agent 1 / Agent 2 scorers + text helpers
  provider.ts       offline fixture LlmProvider
  runner.ts         runCase / runAll (real pipeline + scoring + version capture)
  report.ts         formatReport (the text table above)
  run.ts            `pnpm eval` entry point
  *.test.ts         the harness's own regression tests
```

The harness reuses the production schemas and pipeline functions and never modifies them.
