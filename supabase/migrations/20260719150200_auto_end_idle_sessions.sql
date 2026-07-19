-- M1-E2-T4: auto-end sessions with no activity for 60+ minutes.
-- Runs inside Postgres via pg_cron -- no external scheduler to configure,
-- works identically on local and cloud Supabase.

create extension if not exists pg_cron;

create function public.auto_end_idle_sessions()
returns integer
language sql
security definer
set search_path = public
as $$
  with ended as (
    update sessions
    set ended_at = now(), end_reason = 'auto'
    where ended_at is null
      and coalesce(last_event_at, started_at) < now() - interval '60 minutes'
    returning id
  )
  select count(*)::integer from ended;
$$;

-- Function runs as its owner (postgres) via security definer; API roles may
-- not call it directly. service_role keeps execute so tests/ops can invoke it.
revoke execute on function public.auto_end_idle_sessions() from public, anon, authenticated;
grant execute on function public.auto_end_idle_sessions() to service_role;

select cron.schedule(
  'watchme-auto-end-idle-sessions',
  '*/10 * * * *',
  'select public.auto_end_idle_sessions()'
);
