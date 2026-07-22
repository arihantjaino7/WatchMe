import { describe, expect, it } from "vitest";
import { computeScore, fail, pass, toScorecard, warn } from "./scorecard";

describe("computeScore", () => {
  it("scores an empty check list as a clean 1", () => {
    expect(computeScore([])).toBe(1);
  });

  it("weights pass=1, warn=0.5, fail=0", () => {
    const checks = [pass("a"), warn("b", "x"), fail("c", "y"), pass("d")];
    // (1 + 0.5 + 0 + 1) / 4 = 0.625
    expect(computeScore(checks)).toBe(0.63);
  });

  it("scores all-pass as 1 and all-fail as 0", () => {
    expect(computeScore([pass("a"), pass("b")])).toBe(1);
    expect(computeScore([fail("a", "x"), fail("b", "y")])).toBe(0);
  });
});

describe("toScorecard", () => {
  it("collects failures and warnings and computes the score", () => {
    const card = toScorecard("agent1", [pass("a"), warn("b", "x"), fail("c", "y")]);
    expect(card.agent).toBe("agent1");
    expect(card.score).toBe(0.5);
    expect(card.failures.map((c) => c.name)).toEqual(["c"]);
    expect(card.warnings.map((c) => c.name)).toEqual(["b"]);
  });
});
