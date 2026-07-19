import { fileURLToPath } from "node:url";
import path from "node:path";

const envPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../.env.local");
process.loadEnvFile(envPath);

// Hard stop before a test run can ever touch a non-local database.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
if (!url.includes("127.0.0.1") && !url.includes("localhost")) {
  throw new Error(
    `Integration tests require a LOCAL Supabase (got ${url || "no URL"}). Run: pnpm exec supabase start`,
  );
}
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY missing from apps/web/.env.local");
}
