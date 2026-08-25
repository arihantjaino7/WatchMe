import { evalCases } from "./cases";
import { formatReport } from "./report";
import { runAll } from "./runner";

/**
 * `pnpm eval` entry point. Runs every curated case offline, prints the report,
 * and exits non-zero if any case has a failing check -- suitable for CI.
 */
async function main(): Promise<void> {
  const result = await runAll(evalCases);
  console.log(formatReport(result));
  process.exit(result.ok ? 0 : 1);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
