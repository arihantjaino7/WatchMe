"use server";

import { redirect } from "next/navigation";
import { EXTENSION_AUTH_CODE_TTL_MS } from "@watchme/shared";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/api/service-client";
import { generateExtensionAuthCode, hashExtensionAuthCode } from "@/lib/api/extension-auth-code";

export type ConnectCodeResult = { code: string; expiresAt: string } | { error: string };

/**
 * M1-E1-T2: mint a one-time connect code for the logged-in user. The plaintext
 * code goes only to this user's browser; the DB stores its hash. Codes stay
 * valid for EXTENSION_AUTH_CODE_TTL_MS and die on first exchange.
 */
export async function generateConnectCode(): Promise<ConnectCodeResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const code = generateExtensionAuthCode();
  const expiresAt = new Date(Date.now() + EXTENSION_AUTH_CODE_TTL_MS).toISOString();

  const service = createServiceClient();
  const { error } = await service.from("extension_auth_codes").insert({
    user_id: user.id,
    code_hash: hashExtensionAuthCode(code),
    expires_at: expiresAt,
  });
  if (error) return { error: "Could not create a code. Try again." };

  return { code, expiresAt };
}
