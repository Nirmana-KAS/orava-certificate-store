-- Orava Certificate Store · 0011 · Control Center: manual switches, schedules, presets,
-- user/group/type switches, the Control passkey and rescue links.
-- Run with `pnpm db:migrate`. Adds new tables and one column; no data is changed.

-- One row per section. "on" means working normally.
create table if not exists system_switches (
  section        text primary key check (section in ('system', 'auth', 'public', 'database',
                   'storage', 'search', 'view', 'downloads', 'uploads', 'extraction', 'email',
                   'health')),
  state          text not null default 'on' check (state in ('on', 'readonly', 'hold', 'down')),
  message        text,
  -- Turns itself back on at this time
  until          timestamptz,
  -- Uploads and Extraction only: also stop the admin's own uploads
  include_admin  boolean not null default false,
  reason         text,
  changed_by     text,
  changed_at     timestamptz not null default now()
);
insert into system_switches (section)
select unnest(array['system', 'auth', 'public', 'database', 'storage', 'search', 'view',
                    'downloads', 'uploads', 'extraction', 'email', 'health'])
on conflict (section) do nothing;

-- Switches for selected people, a group or one certificate type. A row means "not on".
create table if not exists access_switches (
  id          uuid primary key default gen_random_uuid(),
  scope       text not null check (scope in ('user', 'group', 'type')),
  target      text not null,
  state       text not null check (state in ('readonly', 'hold', 'down')),
  message     text,
  until       timestamptz,
  reason      text,
  created_by  text,
  created_at  timestamptz not null default now(),
  unique (scope, target)
);

-- Maintenance windows: one-off, every day or on picked weekdays.
create table if not exists switch_schedules (
  id            uuid primary key default gen_random_uuid(),
  section       text not null references system_switches (section),
  state         text not null check (state in ('readonly', 'hold', 'down')),
  message       text,
  kind          text not null check (kind in ('once', 'daily', 'weekly')),
  days          smallint[] not null default '{}',
  start_time    text,
  end_time      text,
  starts_at     timestamptz,
  ends_at       timestamptz,
  tz            text not null default 'Asia/Colombo',
  enabled       boolean not null default true,
  -- Set while a window is open, so its start and end are logged (and emailed) once
  active_since  timestamptz,
  reason        text,
  created_by    text,
  created_at    timestamptz not null default now()
);

-- The admin's own saved setups (the built-in ones live in the code)
create table if not exists switch_presets (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  states      jsonb not null,
  created_by  text,
  created_at  timestamptz not null default now()
);

-- The Control passkey (separate from the admin password, the authenticator and the staff passkey)
create table if not exists control_settings (
  id              boolean primary key default true check (id),
  passkey_hash    text,
  passkey_set_at  timestamptz,
  failed_tries    integer not null default 0,
  locked_until    timestamptz,
  updated_at      timestamptz not null default now()
);
insert into control_settings (id) values (true) on conflict (id) do nothing;

-- Emergency switch-on links: single use, 15 minutes
create table if not exists control_rescue_links (
  id          uuid primary key default gen_random_uuid(),
  token_hash  text not null unique,
  reason      text not null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  used_at     timestamptz
);

-- The Control Center is unlocked for this sign-in until this time
alter table sessions add column if not exists control_until timestamptz;

do $$
declare t text;
begin
  foreach t in array array['system_switches','access_switches','switch_schedules','switch_presets',
                           'control_settings','control_rescue_links']
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
