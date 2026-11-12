-- Orava Certificate Store · 0010 · System Map: health checks, incidents, Diagnose & Fix reports
-- Run with `pnpm db:migrate`. Adds new tables only; no data is changed.

-- Every run of the health checks (every 5 minutes from cron-job.org, when the admin opens the
-- System Map, or by hand). Kept 7 days.
create table if not exists health_runs (
  id       bigint generated always as identity primary key,
  at       timestamptz not null default now(),
  source   text not null check (source in ('cron', 'page', 'manual', 'diagnose', 'daily')),
  ms       integer not null default 0,
  overall  text not null check (overall in ('ok', 'warn', 'fail')),
  results  jsonb not null default '{}'::jsonb
);
create index if not exists health_runs_at_idx on health_runs (at desc);

-- A part of the system that stopped working: opened when its checks fail, resolved when they
-- pass again. One email when it starts and one when it is fixed.
create table if not exists incidents (
  id                   uuid primary key default gen_random_uuid(),
  component            text not null,
  status               text not null default 'open' check (status in ('open', 'resolved')),
  summary              text not null,
  started_at           timestamptz not null default now(),
  last_seen_at         timestamptz not null default now(),
  resolved_at          timestamptz,
  notified_at          timestamptz,
  resolved_notified_at timestamptz
);
create unique index if not exists incidents_open_idx on incidents (component) where status = 'open';
create index if not exists incidents_started_idx on incidents (started_at desc);

-- What "Diagnose & Fix" did: every check, every fix tried, the result
create table if not exists diagnose_reports (
  id         uuid primary key default gen_random_uuid(),
  at         timestamptz not null default now(),
  by_email   text,
  component  text not null,
  outcome    text not null check (outcome in ('fixed', 'ok', 'still_failing', 'needs_you')),
  ms         integer not null default 0,
  report     jsonb not null
);
create index if not exists diagnose_reports_at_idx on diagnose_reports (at desc);

-- Each email sent or failed (no addresses or contents), for the daily limit and failure checks
create table if not exists mail_log (
  id     bigint generated always as identity primary key,
  at     timestamptz not null default now(),
  ok     boolean not null,
  error  text
);
create index if not exists mail_log_at_idx on mail_log (at desc);

do $$
declare t text;
begin
  foreach t in array array['health_runs','incidents','diagnose_reports','mail_log']
  loop
    execute format('alter table %I enable row level security', t);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on table %I from anon', t);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('revoke all on table %I from authenticated', t);
    end if;
  end loop;
end $$;
