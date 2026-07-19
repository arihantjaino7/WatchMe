-- M0-E2-T2: profiles table, RLS, and auto-provisioning trigger.
-- One profiles row per auth.users row, owned exclusively by that user.

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  timezone text not null default 'UTC',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Supabase no longer auto-exposes new tables to API roles; grant exactly what
-- the RLS policies below allow and nothing more (no insert/delete for users).
grant select, update on public.profiles to authenticated;

create policy "profiles are self-readable"
  on public.profiles for select
  using (auth.uid() = user_id);

create policy "profiles are self-updatable"
  on public.profiles for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- No insert/delete policies: rows are only ever created by handle_new_user()
-- below (as the table owner, bypassing RLS) and deleted via the
-- auth.users -> profiles cascade. Users never insert/delete their own row directly.

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id)
  values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();
