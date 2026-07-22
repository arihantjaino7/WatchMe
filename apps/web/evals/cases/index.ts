import type { EvalCase } from "../types";
import { deepFocusCoding } from "./deep-focus-coding";
import { documentationHeavy } from "./documentation-heavy";
import { debuggingSession } from "./debugging-session";
import { researchHeavy } from "./research-heavy";
import { highlyDistracted } from "./highly-distracted";
import { shortInterrupted } from "./short-interrupted";
import { mixedProductivity } from "./mixed-productivity";

/** The curated regression dataset. All synthetic; no production user data. */
export const evalCases: EvalCase[] = [
  deepFocusCoding,
  documentationHeavy,
  debuggingSession,
  researchHeavy,
  highlyDistracted,
  shortInterrupted,
  mixedProductivity,
];
