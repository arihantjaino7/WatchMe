"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { inngest } from "@/lib/inngest/client";

/**
 * M3-E1-T4: manual retry for a session whose analysis pipeline failed
 * permanently. Ownership is enforced by RLS on the update -- a session that
 * doesn't belong to the caller (or doesn't exist) simply updates zero rows.
 */
export async function retryAnalysis(sessionId: string): Promise<void> {
  const supabase = await createClient();

  const { data: updated } = await supabase
    .from("sessions")
    .update({ analysis_status: "pending" })
    .eq("id", sessionId)
    .eq("analysis_status", "failed")
    .select("id")
    .maybeSingle();

  if (updated) {
    await inngest.send({ name: "session/analyze", data: { sessionId } });
  }

  revalidatePath(`/sessions/${sessionId}`);
}
