-- Orava Certificate Store · 0009 · Exact sign-in location and sign-in sessions
-- Run with `pnpm db:migrate`. Adds columns and indexes only; no data is changed.

-- The device's own location (GPS / Wi-Fi), shared by the browser after the person allows it:
-- { lat, lon, accuracy (metres), address, at }. geo_status says how asking went.
alter table sessions add column if not exists geo jsonb;
alter table sessions add column if not exists geo_status text;
alter table sessions drop constraint if exists sessions_geo_status_check;
alter table sessions add constraint sessions_geo_status_check
  check (geo_status is null or geo_status in ('exact', 'refused', 'unavailable'));

-- Each activity entry belongs to the sign-in it happened in, so a session shows all its work
alter table audit_logs add column if not exists session_id uuid;
create index if not exists audit_logs_session_idx on audit_logs (session_id, at)
  where session_id is not null;

-- Sign-in history by person and date
create index if not exists sessions_user_created_idx on sessions (user_id, created_at desc);
create index if not exists sessions_created_idx on sessions (created_at desc);

-- Whether staff must share their location to use the app (admin is never blocked)
alter table app_settings add column if not exists require_location boolean not null default false;
