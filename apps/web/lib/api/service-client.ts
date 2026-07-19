import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client: bypasses RLS. Import only from server-side
 * API/auth code that must act across users (claiming one-time codes, minting
 * sessions). Never let its results flow to a response without an explicit
 * ownership check in the query itself.
 */
export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

/** Anon-key client with no cookie/session state, for token verify/refresh flows. */
export function createAnonClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
