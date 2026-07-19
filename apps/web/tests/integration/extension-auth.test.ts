import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AuthTokensSchema, EXTENSION_AUTH_CODE_TTL_MS } from "@watchme/shared";
import { POST as exchangePost } from "@/app/api/v1/auth/extension/route";
import { POST as refreshPost } from "@/app/api/v1/auth/refresh/route";
import { generateExtensionAuthCode, hashExtensionAuthCode } from "@/lib/api/extension-auth-code";
import {
  createTestUser,
  deleteTestUser,
  jsonRequest,
  serviceClient,
  type TestUser,
} from "./helpers";

/** Mirrors what the /connect-extension server action persists. */
async function mintCode(userId: string, ttlMs = EXTENSION_AUTH_CODE_TTL_MS): Promise<string> {
  const code = generateExtensionAuthCode();
  const { error } = await serviceClient()
    .from("extension_auth_codes")
    .insert({
      user_id: userId,
      code_hash: hashExtensionAuthCode(code),
      expires_at: new Date(Date.now() + ttlMs).toISOString(),
    });
  if (error) throw error;
  return code;
}

describe("POST /api/v1/auth/extension (M1-E1-T1)", () => {
  let user: TestUser;

  beforeAll(async () => {
    user = await createTestUser();
  });
  afterAll(async () => {
    await deleteTestUser(user.id);
  });

  it("exchanges a valid unexpired code for a working token pair", async () => {
    const code = await mintCode(user.id);
    const res = await exchangePost(jsonRequest("/api/v1/auth/extension", { body: { code } }));
    expect(res.status).toBe(200);

    const tokens = AuthTokensSchema.parse(await res.json());
    expect(tokens.userId).toBe(user.id);
    expect(tokens.expiresAt * 1000).toBeGreaterThan(Date.now());

    // The minted access token must actually authenticate as this user.
    const { data, error } = await serviceClient().auth.getUser(tokens.accessToken);
    expect(error).toBeNull();
    expect(data.user?.id).toBe(user.id);
  });

  it("is single-use: the second exchange of the same code fails", async () => {
    const code = await mintCode(user.id);
    const first = await exchangePost(jsonRequest("/api/v1/auth/extension", { body: { code } }));
    expect(first.status).toBe(200);

    const second = await exchangePost(jsonRequest("/api/v1/auth/extension", { body: { code } }));
    expect(second.status).toBe(401);
  });

  it("rejects an expired code", async () => {
    const code = await mintCode(user.id, -1000);
    const res = await exchangePost(jsonRequest("/api/v1/auth/extension", { body: { code } }));
    expect(res.status).toBe(401);
  });

  it("rejects an unknown code and malformed bodies", async () => {
    const unknown = await exchangePost(
      jsonRequest("/api/v1/auth/extension", { body: { code: "WRONGCODE" } }),
    );
    expect(unknown.status).toBe(401);

    const malformed = await exchangePost(
      jsonRequest("/api/v1/auth/extension", { body: { nope: true } }),
    );
    expect(malformed.status).toBe(400);
  });

  it("accepts display formatting (dashes, lowercase) of the same code", async () => {
    const code = await mintCode(user.id);
    const formatted = `${code.slice(0, 4)}-${code.slice(4)}`.toLowerCase();
    const res = await exchangePost(
      jsonRequest("/api/v1/auth/extension", { body: { code: formatted } }),
    );
    expect(res.status).toBe(200);
  });
});

describe("POST /api/v1/auth/refresh (M1-E1-T3 server half)", () => {
  let user: TestUser;

  beforeAll(async () => {
    user = await createTestUser();
  });
  afterAll(async () => {
    await deleteTestUser(user.id);
  });

  it("exchanges a refresh token for a fresh, working token pair", async () => {
    const res = await refreshPost(
      jsonRequest("/api/v1/auth/refresh", { body: { refreshToken: user.refreshToken } }),
    );
    expect(res.status).toBe(200);

    const tokens = AuthTokensSchema.parse(await res.json());
    expect(tokens.userId).toBe(user.id);
    // Rotation: Supabase hands back a NEW refresh token.
    expect(tokens.refreshToken).not.toBe(user.refreshToken);

    const { data } = await serviceClient().auth.getUser(tokens.accessToken);
    expect(data.user?.id).toBe(user.id);

    // Keep the rotated token so later tests (and afterAll) stay consistent.
    user.refreshToken = tokens.refreshToken;
    user.accessToken = tokens.accessToken;
  });

  it("rejects a garbage refresh token", async () => {
    const res = await refreshPost(
      jsonRequest("/api/v1/auth/refresh", { body: { refreshToken: "not-a-real-token" } }),
    );
    expect(res.status).toBe(401);
  });
});
