-- Orava Certificate Store · 0006 · per-person permissions and upload mode for special staff
-- Run with `pnpm db:migrate`.
--
-- Staff (role 'viewer') sign in with email + shared passkey. On top of that, the admin switches
-- these on or off for each person:
--   can_download  view and download certificate files              (existing)
--   can_report    make reports from filtered and sorted lists      (new, used from Phase 4b)
--   can_upload    "uploader": add, replace, edit and delete certificates, after unlocking upload
--                 mode with a personal upload passkey that only the admin can issue or reset

alter table app_users add column if not exists can_report boolean not null default false;
alter table app_users add column if not exists can_upload boolean not null default false;
alter table app_users add column if not exists upload_passkey_hash text;
alter table app_users add column if not exists upload_passkey_set_at timestamptz;
alter table app_users add column if not exists upload_failures integer not null default 0;
alter table app_users add column if not exists upload_locked_at timestamptz;

-- Upload mode belongs to one sign-in (one device) and ends after 30 minutes without activity
alter table sessions add column if not exists upload_until timestamptz;

-- Wrong upload passkeys are counted with the other sign-in attempts
alter table login_attempts drop constraint if exists login_attempts_kind_check;
alter table login_attempts add constraint login_attempts_kind_check
  check (kind in ('passkey', 'admin_password', 'email_code', 'totp', 'setup', 'upload_passkey'));
