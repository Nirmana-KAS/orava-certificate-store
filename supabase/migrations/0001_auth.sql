-- Orava Certificate Store · 0001 · users, sign-in, sessions, audit and security events
-- Run with `pnpm db:migrate`, or paste into the Supabase SQL editor.
-- All times are timestamptz (UTC). Emails are stored lower-case.

create table if not exists app_users (
  id             uuid primary key default gen_random_uuid(),
  email          text not null unique check (email = lower(email) and position('@' in email) > 1),
  name           text,
  role           text not null default 'viewer' check (role in ('admin', 'viewer')),
  status         text not null default 'active' check (status in ('active', 'disabled')),
  can_download   boolean not null default true,
  created_by     uuid references app_users (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  last_login_at  timestamptz
);

-- Exactly one row of app-wide settings
create table if not exists app_settings (
  id                   boolean primary key default true check (id),
  passkey_hash         text,
  passkey_version      integer not null default 1,
  passkey_rotated_at   timestamptz,
  session_hours        integer not null default 12 check (session_hours between 1 and 168),
  require_device_code  boolean not null default true,
  lockdown             boolean not null default false,
  alert_email          text,
  ai_enabled           boolean not null default false,
  updated_at           timestamptz not null default now()
);
insert into app_settings (id) values (true) on conflict (id) do nothing;

create table if not exists admin_credentials (
  user_id          uuid primary key references app_users (id) on delete cascade,
  password_hash    text not null,
  totp_secret_enc  text not null,            -- AES-256-GCM, key derived from AUTH_SECRET
  password_changed_at timestamptz not null default now(),
  created_at       timestamptz not null default now()
);

create table if not exists sessions (
  id               uuid primary key default gen_random_uuid(),
  token_hash       text not null unique,      -- HMAC of the cookie token; the token itself is never stored
  user_id          uuid not null references app_users (id) on delete cascade,
  role             text not null check (role in ('admin', 'viewer')),
  passkey_version  integer,                   -- viewer sessions end when the passkey is rotated
  ip               text,
  user_agent       text,
  country          text,
  created_at       timestamptz not null default now(),
  last_seen_at     timestamptz not null default now(),
  expires_at       timestamptz not null,
  revoked_at       timestamptz
);
create index if not exists sessions_user_idx on sessions (user_id) where revoked_at is null;

-- Second step of a sign-in: an emailed code (staff on a new device) or an authenticator code (admin)
create table if not exists login_challenges (
  id           uuid primary key default gen_random_uuid(),
  token_hash   text not null unique,
  user_id      uuid not null references app_users (id) on delete cascade,
  kind         text not null check (kind in ('email_code', 'totp')),
  code_hash    text,
  attempts     integer not null default 0,
  ip           text,
  user_agent   text,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  consumed_at  timestamptz
);

create table if not exists trusted_devices (
  id            uuid primary key default gen_random_uuid(),
  token_hash    text not null unique,
  user_id       uuid not null references app_users (id) on delete cascade,
  user_agent    text,
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz not null default now(),
  expires_at    timestamptz not null
);

create table if not exists login_attempts (
  id       bigint generated always as identity primary key,
  ip       text,
  email    text,
  kind     text not null check (kind in ('passkey', 'admin_password', 'email_code', 'totp', 'setup')),
  success  boolean not null,
  at       timestamptz not null default now()
);
create index if not exists login_attempts_ip_idx on login_attempts (ip, at desc);
create index if not exists login_attempts_email_idx on login_attempts (email, at desc);

create table if not exists ip_blocks (
  id          uuid primary key default gen_random_uuid(),
  ip          text not null,
  reason      text not null,
  created_by  uuid references app_users (id) on delete set null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz                       -- null = until removed
);
create index if not exists ip_blocks_ip_idx on ip_blocks (ip);

create table if not exists audit_logs (
  id           bigint generated always as identity primary key,
  actor_id     uuid references app_users (id) on delete set null,
  actor_email  text,
  action       text not null,
  target       text,
  ip           text,
  user_agent   text,
  meta         jsonb not null default '{}'::jsonb,
  at           timestamptz not null default now()
);
create index if not exists audit_logs_at_idx on audit_logs (at desc);

create table if not exists security_events (
  id        bigint generated always as identity primary key,
  kind      text not null,
  severity  text not null check (severity in ('info', 'low', 'medium', 'high', 'critical')),
  ip        text,
  email     text,
  path      text,
  country   text,
  detail    jsonb not null default '{}'::jsonb,
  at        timestamptz not null default now()
);
create index if not exists security_events_at_idx on security_events (at desc);

-- Deny-all Row Level Security: only the server (direct Postgres connection) can read or write.
-- Supabase's public API roles get no access at all, even with a leaked anon key.
do $$
declare t text;
begin
  foreach t in array array['app_users','app_settings','admin_credentials','sessions','login_challenges',
                           'trusted_devices','login_attempts','ip_blocks','audit_logs','security_events']
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
