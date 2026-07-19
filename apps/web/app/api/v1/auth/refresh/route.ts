import { NextResponse } from "next/server";
import { RefreshTokenRequestSchema, type RefreshTokenResponse } from "@watchme/shared";
import { createAnonClient } from "@/lib/api/service-client";
import { jsonError, readJson } from "@/lib/api/responses";

/**
 * M1-E1-T3 (server half): the extension refreshes its short-lived JWT here
 * instead of talking to Supabase directly, so the extension is configured
 * with exactly one base URL and the auth provider stays swappable.
 *
 * Supabase rotates refresh tokens: every response carries a NEW refresh token
 * the client must store in place of the one it sent.
 */
export async function POST(request: Request) {
  const body = await readJson(request);
  const parsed = RefreshTokenRequestSchema.safeParse(body);
  if (!parsed.success) return jsonError(400, "invalid request body");

  const anon = createAnonClient();
  const { data, error } = await anon.auth.refreshSession({
    refresh_token: parsed.data.refreshToken,
  });
  if (error || !data.session || !data.user) {
    return jsonError(401, "invalid refresh token");
  }

  const response: RefreshTokenResponse = {
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    expiresAt: data.session.expires_at ?? 0,
    userId: data.user.id,
  };
  return NextResponse.json(response);
}
