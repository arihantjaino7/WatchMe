import { describe, expect, it } from "vitest";
import { ReflectionSchema } from "./reflection";

function validReflection(overrides: Record<string, unknown> = {}) {
  return {
    narrative: "Spent most of the session in the editor with two short detours to social media.",
    productivity: {
      label: "high",
      score: 78,
      assessment: "Strong sustained coding with limited fragmentation.",
    },
    distraction: {
      summary: "Two brief visits to twitter.com broke an otherwise focused stretch.",
      sources: ["twitter.com"],
    },
    focus: {
      strongest: "A 42-minute block on github.com in the first half.",
      weakest: "A fragmented 8-minute stretch near the end with three context switches.",
    },
    intent: {
      verdict: "aligned",
      assessment: "The declared intent to ship the auth fix matches the coding-heavy timeline.",
    },
    observations: ["Deep focus clustered early", "Distractions rose as the session went on"],
    suggestions: ["Block twitter.com during the last 30 minutes of a session."],
    confidence: 0.72,
    ...overrides,
  };
}

describe("ReflectionSchema", () => {
  it("accepts a well-formed reflection", () => {
    expect(ReflectionSchema.safeParse(validReflection()).success).toBe(true);
  });

  it("rejects a missing top-level field", () => {
    const { narrative: _n, ...withoutNarrative } = validReflection();
    expect(ReflectionSchema.safeParse(withoutNarrative).success).toBe(false);
  });

  it("rejects more than 3 suggestions", () => {
    const result = ReflectionSchema.safeParse(
      validReflection({ suggestions: ["a", "b", "c", "d"] }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects an empty suggestions list", () => {
    expect(ReflectionSchema.safeParse(validReflection({ suggestions: [] })).success).toBe(false);
  });

  it("rejects a confidence outside 0..1", () => {
    expect(ReflectionSchema.safeParse(validReflection({ confidence: 1.4 })).success).toBe(false);
  });

  it("rejects an unknown productivity label", () => {
    const result = ReflectionSchema.safeParse(
      validReflection({ productivity: { label: "amazing", score: 90, assessment: "x" } }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects arbitrary extra keys (strict, no free-form output)", () => {
    const result = ReflectionSchema.safeParse(validReflection({ mood: "great" }));
    expect(result.success).toBe(false);
  });

  it("rejects an empty narrative string", () => {
    expect(ReflectionSchema.safeParse(validReflection({ narrative: "" })).success).toBe(false);
  });
});
