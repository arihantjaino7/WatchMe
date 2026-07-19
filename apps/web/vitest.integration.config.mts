import { fileURLToPath } from "node:url";
import path from "node:path";
import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

/**
 * Integration tests: exercise the real route handlers against the LOCAL
 * Supabase stack (`pnpm exec supabase start`). Deliberately not part of
 * `pnpm test` -- CI has no database; run via `pnpm test:integration`.
 */
export default defineConfig({
  resolve: {
    alias: { "@": root },
  },
  test: {
    include: ["tests/integration/**/*.test.ts"],
    setupFiles: ["tests/integration/setup.ts"],
    // Tests share one database; parallel files would race on per-user state.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
