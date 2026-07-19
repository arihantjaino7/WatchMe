-- M1-E2-T1 / M1-E3-T4: session lifecycle + idempotent event ingestion.
-- Column shapes mirror the Zod contract in packages/shared (session.ts,
-- session-event.ts) -- change those first, then this.

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  intent text check (char_length(intent) <= 500),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  end_reason text check (end_reason in ('user', 'auto', 'error')),
  analysis_status text not null default 'pending'
    check (analysis_status in ('pending', 'running', 'complete', 'failed')),
  stats jsonb,
  -- Touched on every event batch; drives the 60-minute idle auto-end job.
  last_event_at timestamptz,
  created_at timestamptz not null default now()
);

-- "Starting twice returns the same session" is enforced here, not just in the
-- API: a user can have at most one session with no ended_at.
create unique index sessions_one_active_per_user
  on public.sessions (user_id)
  where ended_at is null;

create index sessions_user_started_idx on public.sessions (user_id, started_at desc);

alter table public.sessions enable row level security;
grant select, insert, update on public.sessions to authenticated;
-- service_role bypasses RLS but still needs table-level privileges.
grant select, insert, update, delete on public.sessions to service_role;

create policy "sessions are self-readable"
  on public.sessions for select
  using (auth.uid() = user_id);

create policy "sessions are self-insertable"
  on public.sessions for insert
  with check (auth.uid() = user_id);

create policy "sessions are self-updatable"
  on public.sessions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table public.events (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.sessions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Generated client-side once per logical event; the uniqueness constraint
  -- below is what makes retried uploads exactly-once.
  client_event_id text not null check (char_length(client_event_id) <= 128),
  type text not null check (
    type in (
      'tab_focus', 'tab_blur', 'url_change', 'window_focus', 'window_blur',
      'idle_start', 'idle_end', 'redacted'
    )
  ),
  occurred_at timestamptz not null,
  url text check (char_length(url) <= 2048),
  title text check (char_length(title) <= 512),
  domain text check (char_length(domain) <= 255),
  duration_ms integer check (duration_ms >= 0),
  source text not null default 'extension' check (source in ('extension')),
  created_at timestamptz not null default now(),
  unique (session_id, client_event_id)
);

create index events_session_occurred_idx on public.events (session_id, occurred_at);

alter table public.events enable row level security;
grant select, insert on public.events to authenticated;
grant select, insert, update, delete on public.events to service_role;

create policy "events are self-readable"
  on public.events for select
  using (auth.uid() = user_id);

create policy "events are self-insertable"
  on public.events for insert
  with check (auth.uid() = user_id);

-- No update/delete grants or policies on events: captured history is
-- append-only from the API roles' point of view.
