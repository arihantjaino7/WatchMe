import { AuthTokensSchema, type AuthTokens } from "@watchme/shared";
import { API_BASE_URL } from "./config";

/**
 * M1-E1-T3: token lifecycle for the extension.
 *
 * The long-lived refresh token lives in chrome.storage.local (survives browser
 * restarts). Short-lived JWTs are minted from it on demand and refreshed
 * transparently ~60s before expiry -- callers just use apiFetch() and never
 * see a token. Refresh tokens rotate on every use, so the stored pair is
 * always replaced wholesale.
 */

const STORAGE_KEY = "watchme-auth";

/** Thrown when the extension has no usable credentials -- popup shows "Connect". */
export class NotConnectedError extends Error {
  constructor() {
    super("extension is not connected to a WatchMe account");
    this.name = "NotConnectedError";
  }
}

export async function getStoredAuth(): Promise<AuthTokens | null> {
  const record = await chrome.storage.local.get(STORAGE_KEY);
  const parsed = AuthTokensSchema.safeParse(record[STORAGE_KEY]);
  return parsed.success ? parsed.data : null;
}

async function storeAuth(tokens: AuthTokens): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: tokens });
}

export async function clearAuth(): Promise<void> {
  await chrome.storage.local.remove(STORAGE_KEY);
}

/** Exchange a one-time connect code (M1-E1-T1) for the initial token pair. */
export async function connectWithCode(code: string): Promise<AuthTokens> {
  const res = await fetch(`${API_BASE_URL}/api/v1/auth/extension`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code }),
  });
  if (!res.ok) {
    throw new Error(res.status === 401 ? "That code is invalid or expired." : "Connection failed.");
  }
  const tokens = AuthTokensSchema.parse(await res.json());
  await storeAuth(tokens);
  return tokens;
}

// Serialize refreshes within one service-worker lifetime so concurrent events
// don't race a rotating refresh token. (Supabase also tolerates a short reuse
// window, which covers the restart-mid-refresh edge.)
let refreshInFlight: Promise<AuthTokens> | null = null;

async function refresh(current: AuthTokens): Promise<AuthTokens> {
  refreshInFlight ??= (async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/auth/refresh`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ refreshToken: current.refreshToken }),
      });
      if (res.status === 401) {
        // Refresh token revoked/expired: the connection is dead for good.
        await clearAuth();
        throw new NotConnectedError();
      }
      if (!res.ok) throw new Error(`token refresh failed (${res.status})`);
      const tokens = AuthTokensSchema.parse(await res.json());
      await storeAuth(tokens);
      return tokens;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

const EXPIRY_MARGIN_MS = 60_000;

export async function getValidAccessToken(): Promise<string> {
  const auth = await getStoredAuth();
  if (!auth) throw new NotConnectedError();
  if (auth.expiresAt * 1000 - EXPIRY_MARGIN_MS > Date.now()) return auth.accessToken;
  return (await refresh(auth)).accessToken;
}

/**
 * Authenticated fetch against the WatchMe API. Retries exactly once with a
 * forced refresh if the server rejects the JWT (clock skew, revocation lag).
 * Network failures propagate as thrown errors -- callers treat them as
 * "offline, try later".
 */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const attempt = (token: string) =>
    fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...(init.headers ?? {}),
        authorization: `Bearer ${token}`,
      },
    });

  const res = await attempt(await getValidAccessToken());
  if (res.status !== 401) return res;

  const auth = await getStoredAuth();
  if (!auth) throw new NotConnectedError();
  const refreshed = await refresh(auth);
  return attempt(refreshed.accessToken);
}
