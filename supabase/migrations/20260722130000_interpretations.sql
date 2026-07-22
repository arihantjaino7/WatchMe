-- M3-E2: Agent 1 (Activity Interpreter) intermediate artifact. Versioned like
-- `reports` for the same reason: this is stochastic AI output worth keeping a
-- history of across re-analyses -- unlike `sessions.stats`, which is
-- deterministic compiler output and safe to denormalize/overwrite in place.
-- Column shapes mirror the Zod contract in packages/shared
-- (activity-interpretation.ts): `interpretation` holds the validated
-- ActivityInterpretation JSON verbatim (never markdown).

create table public.interpretations (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Monotonic per session: two analyses of the same session are two versions.
  version integer not null,
  -- The full structured interpretation (raw JSON, not markdown).
  interpretation jsonb not null,
  -- Observability: which model produced it and under which prompt revision.
  model text not null,
  prompt_version text not null,
  tokens_used integer check (tokens_used >= 0),
  created_at timestamptz not null default now(),
  unique (session_id, version)
);

create index interpretations_session_version_idx
  on public.interpretations (session_id, version desc);

alter table public.interpretations enable row level security;
-- Interpretations are read on the dashboard (debugging/inspection) but written
-- only by the analysis pipeline (service role), so authenticated users get
-- select only -- no insert/update.
grant select on public.interpretations to authenticated;
-- service_role bypasses RLS but still needs table-level privileges.
grant select, insert, update, delete on public.interpretations to service_role;

create policy "interpretations are self-readable"
  on public.interpretations for select
  using (auth.uid() = user_id);

-- No insert/update/delete grants or policies for authenticated: interpretations
-- are produced by the pipeline, never written by the client.
