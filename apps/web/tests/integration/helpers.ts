import { createClient } from "@supabase/supabase-js";

export function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export type TestUser = {
  id: string;
  email: string;
  accessToken: string;
  refreshToken: string;
};

export async function createTestUser(): Promise<TestUser> {
  const email = `it-${crypto.randomUUID()}@watchme.test`;
  const password = `pw-${crypto.randomUUID()}`;
  const service = serviceClient();

  const { data: created, error: createError } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError || !created.user) throw createError ?? new Error("createUser failed");

  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data: signedIn, error: signInError } = await anon.auth.signInWithPassword({
    email,
    password,
  });
  if (signInError || !signedIn.session) throw signInError ?? new Error("signIn failed");

  return {
    id: created.user.id,
    email,
    accessToken: signedIn.session.access_token,
    refreshToken: signedIn.session.refresh_token,
  };
}

/** Cascades: profiles, sessions, events, auth codes all reference auth.users. */
export async function deleteTestUser(id: string) {
  await serviceClient().auth.admin.deleteUser(id);
}

export function jsonRequest(
  url: string,
  { method = "POST", token, body }: { method?: string; token?: string; body?: unknown } = {},
): Request {
  return new Request(`http://localhost${url}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

export const routeParams = (id: string) => ({ params: Promise.resolve({ id }) });
