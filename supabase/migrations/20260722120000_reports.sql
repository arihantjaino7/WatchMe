-- M3-E3: AI reflection reports. One row per analysis run; re-analyzing a session
-- appends a new version rather than overwriting, so history is preserved.
-- Column shapes mirror the Zod contract in packages/shared (reflection.ts):
-- `reflection` holds the validated Reflection JSON verbatim (never markdown).

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Monotonic per session: two analyses of the same session are two versions.
  version integer not null,
  -- The full structured reflection (raw JSON, not markdown).
  reflection jsonb not null,
  -- Observability: which model produced it and under which prompt revision.
  model text not null,
  prompt_version text not null,
  tokens_used integer check (tokens_used >= 0),
  created_at timestamptz not null default now(),
  unique (session_id, version)
);

create index reports_session_version_idx
  on public.reports (session_id, version desc);

alter table public.reports enable row level security;
-- Reports are read on the dashboard but written only by the analysis pipeline
-- (service role), so authenticated users get select only -- no insert/update.
grant select on public.reports to authenticated;
-- service_role bypasses RLS but still needs table-level privileges.
grant select, insert, update, delete on public.reports to service_role;

create policy "reports are self-readable"
  on public.reports for select
  using (auth.uid() = user_id);

-- No insert/update/delete grants or policies for authenticated: reflection
-- reports are produced by the pipeline, never written by the client.
