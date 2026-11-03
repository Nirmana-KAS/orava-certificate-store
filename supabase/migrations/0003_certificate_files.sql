-- Orava Certificate Store · 0003 · files (PDF / scanned images) attached to certificates
-- The files themselves live in the private Supabase Storage bucket "certificates"; this table
-- records what was checked and accepted. Deny-all Row Level Security like every other table.

create table if not exists certificate_files (
  id              uuid primary key,
  certificate_id  uuid not null references certificates (id),
  kind            text not null check (kind in ('pdf', 'jpeg', 'png', 'webp')),
  mime            text not null check (mime in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  storage_path    text not null unique,
  original_name   text not null,                 -- shown to the admin only, never used as a path
  size_bytes      bigint not null check (size_bytes > 0),
  sha256          text check (sha256 ~ '^[0-9a-f]{64}$'),
  status          text not null default 'pending' check (status in ('pending', 'ready')),
  created_by      uuid references app_users (id) on delete set null,
  created_at      timestamptz not null default now(),
  verified_at     timestamptz
);
create index if not exists certificate_files_cert_idx on certificate_files (certificate_id);
create index if not exists certificate_files_sha_idx on certificate_files (sha256) where status = 'ready';

do $$
begin
  execute 'alter table certificate_files enable row level security';
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on table certificate_files from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on table certificate_files from authenticated';
  end if;
end $$;
