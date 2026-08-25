import { describe, expect, it } from "vitest";
import { evalCases } from "./cases";
import { runAll, runCase } from "./runner";

/**
 * The curated dataset IS the regression baseline: every synthetic case must
 * pass through the real pipeline + scoring cleanly. A failure here means either
 * a prompt/schema/compiler change altered behavior, or a fixture drifted.
 */
describe("curated evaluation dataset", () => {
  it("covers the required scenario spread", () => {
    expect(evalCases.length).toBeGreaterThanOrEqual(7);
    expect(new Set(evalCases.map((c) => c.id)).size).toBe(evalCases.length);
  });

  it("passes every curated case with no failures", async () => {
    const run = await runAll(evalCases);
    const offenders = run.cases
      .filter((c) => c.agent1.failures.length > 0 || c.agent2.failures.length > 0)
      .map((c) => ({
        id: c.id,
        a1: c.agent1.failures.map((f) => `${f.name}: ${f.detail}`),
        a2: c.agent2.failures.map((f) => `${f.name}: ${f.detail}`),
      }));
    expect(offenders).toEqual([]);
    expect(run.ok).toBe(true);
    expect(run.totals.agent1).toBe(1);
    expect(run.totals.agent2).toBe(1);
  });

  it("records all six version fields for every case", async () => {
    for (const evalCase of evalCases) {
      const { versions } = await runCase(evalCase);
      expect(versions.model).toBeTruthy();
      expect(versions.provider).toBe("fixture");
      expect(versions.interpretationPromptVersion).toBeTruthy();
      expect(versions.reflectionPromptVersion).toBeTruthy();
      expect(versions.compilerVersion).toBeGreaterThan(0);
    }
  });
});
