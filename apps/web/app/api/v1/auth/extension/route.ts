import { NextResponse } from "next/server";
import { ExtensionAuthRequestSchema, type ExtensionAuthResponse } from "@watchme/shared";
import { createAnonClient, createServiceClient } from "@/lib/api/service-client";
import { hashExtensionAuthCode } from "@/lib/api/extension-auth-code";
import { jsonError, readJson } from "@/lib/api/responses";

/**
 * M1-E1-T1: exchange a one-time connect code for a Supabase token pair.
 *
 * Single-use is enforced by the atomic claim below: the UPDATE only matches a
 * row whose used_at is still null, so two racing exchanges of the same code
 * can never both succeed -- the second one matches zero rows.
 */
export async function POST(request: Request) {
  const body = await readJson(request);
  const parsed = ExtensionAuthRequestSchema.safeParse(body);
  if (!parsed.success) return jsonError(400, "invalid request body");

  const service = createServiceClient();

  const { data: claimed, error: claimError } = await service
    .from("extension_auth_codes")
    .update({ used_at: new Date().toISOString() })
    .eq("code_hash", hashExtensionAuthCode(parsed.data.code))
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("user_id")
    .maybeSingle();

  if (claimError) return jsonError(500, "code lookup failed");
  if (!claimed) return jsonError(401, "invalid or expired code");

  // Mint a session for the code's owner: generate a magic-link token hash via
  // the admin API and immediately verify it ourselves. No email is sent; the
  // token never leaves this handler.
  const { data: userData, error: userError } = await service.auth.admin.getUserById(
    claimed.user_id,
  );
  if (userError || !userData.user?.email) return jsonError(500, "user lookup failed");

  const { data: linkData, error: linkError } = await service.auth.admin.generateLink({
    type: "magiclink",
    email: userData.user.email,
  });
  if (linkError || !linkData.properties?.hashed_token) {
    return jsonError(500, "session mint failed");
  }

  const anon = createAnonClient();
  const { data: verified, error: verifyError } = await anon.auth.verifyOtp({
    type: "magiclink",
    token_hash: linkData.properties.hashed_token,
  });
  if (verifyError || !verified.session) return jsonError(500, "session mint failed");

  const response: ExtensionAuthResponse = {
    accessToken: verified.session.access_token,
    refreshToken: verified.session.refresh_token,
    expiresAt: verified.session.expires_at ?? 0,
    userId: claimed.user_id,
  };
  return NextResponse.json(response);
}
