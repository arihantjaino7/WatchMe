import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { analyzeSession } from "@/lib/inngest/functions/analyze-session";

/**
 * Inngest's HTTP endpoint. Inngest (dev server locally, cloud in prod) calls
 * this route to invoke registered functions. Not under /api/v1 -- it is
 * infrastructure, not part of the versioned extension API -- and the auth-cookie
 * middleware already skips all /api/ paths.
 */
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [analyzeSession],
});
