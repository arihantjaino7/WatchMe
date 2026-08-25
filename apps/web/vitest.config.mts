import { fileURLToPath } from "node:url";
import path from "node:path";
import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

/**
 * Unit tests: pure logic under `lib/` (compiler, LLM abstraction, reflection
 * pipeline). No database, no network, no LLM API -- providers are faked. The
 * database-backed integration suite is separate (vitest.integration.config.mts).
 */
export default defineConfig({
  resolve: {
    alias: { "@": root },
  },
  test: {
    include: ["lib/**/*.test.ts", "evals/**/*.test.ts"],
    exclude: ["node_modules", "tests/integration/**"],
  },
});
