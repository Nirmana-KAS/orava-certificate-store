-- Orava Certificate Store · 0008 · Backup reminder choices, Trash "seen", sign-in location
-- Run with `pnpm db:migrate`. Adds columns and an index only; no data is changed.

-- How often to remind about backups (days; 0 = never), and where (Overview banner, email)
alter table app_settings add column if not exists backup_remind_days integer not null default 7;
alter table app_settings drop constraint if exists app_settings_backup_remind_days_check;
alter table app_settings add constraint app_settings_backup_remind_days_check
  check (backup_remind_days in (0, 1, 3, 7, 14, 30));
alter table app_settings add column if not exists backup_remind_banner boolean not null default true;
alter table app_settings add column if not exists backup_remind_email boolean not null default true;

-- When the admin last opened the Trash: the Overview only mentions certificates deleted after it
alter table app_settings add column if not exists trash_seen_at timestamptz;

-- Where and on what a request came from: approximate place (from the IP address, given by the
-- hosting), and the system version and device model the browser shares
alter table audit_logs add column if not exists client jsonb;
alter table sessions add column if not exists client jsonb;

-- The Staff page shows each person's latest sign-in
create index if not exists audit_logs_sign_in_idx on audit_logs (actor_id, at desc)
  where action in ('sign_in', 'admin.sign_in');
