import { z } from "zod";

/**
 * Extension auth handoff (M1-E1, see ARCHITECTURE.md §14): the browser
 * extension never sees the user's web session cookie. Instead, a logged-in
 * user generates a short-lived one-time code on /connect-extension, the
 * extension exchanges it exactly once for a token pair, and from then on
 * refreshes its own tokens through the API without touching the web app.
 */

/** How long a generated connect code stays exchangeable. */
export const EXTENSION_AUTH_CODE_TTL_MS = 10 * 60 * 1000;

/**
 * Connect codes are typed by hand from the web page into the popup, so they
 * use a short unambiguous alphabet (no 0/O/1/I/L). Dashes/whitespace/case are
 * display sugar -- normalize before comparing or hashing.
 */
export const EXTENSION_AUTH_CODE_LENGTH = 8;
export const EXTENSION_AUTH_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function normalizeExtensionAuthCode(raw: string): string {
  return raw.replace(/[\s-]/g, "").toUpperCase();
}

export const ExtensionAuthRequestSchema = z.object({
  code: z.string().min(1).max(64),
});
export type ExtensionAuthRequest = z.infer<typeof ExtensionAuthRequestSchema>;

/**
 * One shape for both the initial exchange and every refresh: the extension
 * treats "connect" and "refresh" responses identically when storing tokens.
 */
export const AuthTokensSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  /** Epoch seconds (not ms) when accessToken expires -- matches Supabase's `expires_at`. */
  expiresAt: z.number().int().nonnegative(),
  userId: z.string().uuid(),
});
export type AuthTokens = z.infer<typeof AuthTokensSchema>;

export const ExtensionAuthResponseSchema = AuthTokensSchema;
export type ExtensionAuthResponse = z.infer<typeof ExtensionAuthResponseSchema>;

export const RefreshTokenRequestSchema = z.object({
  refreshToken: z.string().min(1),
});
export type RefreshTokenRequest = z.infer<typeof RefreshTokenRequestSchema>;

export const RefreshTokenResponseSchema = AuthTokensSchema;
export type RefreshTokenResponse = z.infer<typeof RefreshTokenResponseSchema>;

/** Uniform error body for every /api/v1 endpoint. */
export const ApiErrorSchema = z.object({
  error: z.string(),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;
