-- Orava Certificate Store · 0007 · Trash, activity log filters and backups
-- Run with `pnpm db:migrate`. Adds columns and indexes only; no data is changed.

-- Who moved a certificate to the Trash (shown on the Trash page)
alter table certificates add column if not exists deleted_by uuid references app_users (id) on delete set null;

-- The Trash page and the 30-day clean-up read deleted certificates by date
create index if not exists certificates_trash_idx on certificates (deleted_at)
  where deleted_at is not null;

-- The activity log is filtered by person and by kind of action
create index if not exists audit_logs_actor_idx on audit_logs (actor_email, at desc);
create index if not exists audit_logs_action_idx on audit_logs (action, at desc);
