import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

export type AuthedRequest = {
  /** RLS-scoped client acting as the calling user -- safe for all queries. */
  supabase: SupabaseClient;
  user: User;
};

/**
 * Bearer-token auth for /api/v1 routes. The extension (the only API client in
 * M1) sends `Authorization: Bearer <supabase access token>`; cookie sessions
 * are deliberately not accepted here so the API surface has exactly one auth
 * path to reason about. Returns null on any failure -- callers respond 401.
 */
export async function authenticateRequest(request: Request): Promise<AuthedRequest | null> {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  if (!token) return null;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  return { supabase, user: data.user };
}
