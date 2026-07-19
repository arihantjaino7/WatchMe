-- M1-E1-T1: one-time codes for the extension auth handoff.
-- Only the hash of a code is ever stored; the plaintext exists briefly in the
-- logged-in user's browser and in the extension that exchanges it.

create table public.extension_auth_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  code_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);

create index extension_auth_codes_user_id_idx on public.extension_auth_codes (user_id);

-- Service-role only: codes are written by the /connect-extension server action
-- and claimed by the exchange endpoint. RLS on with no policies (and no grants)
-- means the anon/authenticated API roles cannot touch this table at all.
-- (Grants are explicit because this Supabase version has no default privileges
-- for API roles on new tables -- true for every table in this project.)
alter table public.extension_auth_codes enable row level security;
grant select, insert, update, delete on public.extension_auth_codes to service_role;
