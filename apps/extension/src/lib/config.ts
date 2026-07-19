/**
 * The extension's ONLY configuration is the WatchMe API base URL. It never
 * talks to Supabase (or any provider) directly -- auth handoff, token refresh,
 * and event upload all go through /api/v1, so the backend stays swappable
 * without shipping a new extension.
 *
 * Override for local dev with apps/extension/.env.local:
 *   VITE_WATCHME_API_URL=http://localhost:3000
 */
export const API_BASE_URL: string =
  import.meta.env.VITE_WATCHME_API_URL ?? "https://watchme-web.vercel.app";
