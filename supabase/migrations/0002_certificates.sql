-- Orava Certificate Store · 0002 · certificate types, certificates, and the 4 sample types
-- Run with `pnpm db:migrate`. Deny-all Row Level Security like every other table.

create table if not exists certificate_types (
  id                   uuid primary key default gen_random_uuid(),
  slug                 text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name                 text not null,
  lab                  text not null default '',          -- issuer / laboratory, filterable across types
  description          text not null default '',
  icon                 text not null default 'file-text',
  color                text not null default '#3a75b1',
  expiry_tracking      boolean not null default false,
  expiry_warning_days  integer not null default 30 check (expiry_warning_days between 1 and 365),
  fields               jsonb not null default '[]'::jsonb, -- field definitions, with extraction hints per field
  fingerprints         text[] not null default '{}',       -- phrases that identify this type after OCR
  summary_template     text not null default '',
  version              integer not null default 1,
  archived             boolean not null default false,
  sort_order           integer not null default 0,
  created_by           uuid references app_users (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- Every save keeps the previous definition, so old certificates can always be read
create table if not exists certificate_type_versions (
  type_id     uuid not null references certificate_types (id) on delete cascade,
  version     integer not null,
  snapshot    jsonb not null,
  changed_by  uuid references app_users (id) on delete set null,
  changed_at  timestamptz not null default now(),
  primary key (type_id, version)
);

create table if not exists certificates (
  id              uuid primary key default gen_random_uuid(),
  type_id         uuid not null references certificate_types (id),
  type_version    integer not null default 1,
  title           text not null,
  -- "core roles": one field of each type is mapped here so search and sort work across all types
  report_no       text,
  report_date     date,
  customer        text,
  identification  text,
  weight_ct       numeric(12, 3),
  expiry_date     date,
  data            jsonb not null default '{}'::jsonb,      -- all type-specific values, by field key
  key_points      text[] not null default '{}',
  summary         text not null default '',
  created_by      uuid references app_users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);
create index if not exists certificates_type_idx on certificates (type_id) where deleted_at is null;
create index if not exists certificates_date_idx on certificates (report_date desc) where deleted_at is null;
create index if not exists certificates_report_no_idx on certificates (report_no) where deleted_at is null;

do $$
declare t text;
begin
  foreach t in array array['certificate_types','certificate_type_versions','certificates']
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

-- The 4 sample types (edit or add more from Admin → Certificate types)
insert into certificate_types
  (slug, name, lab, description, icon, color, expiry_tracking, summary_template, fingerprints, fields, sort_order)
values
  ('aigs-gemstone-identification-report', 'AIGS Gemstone Identification Report', 'AIGS', 'Full report with photo, signatures and instruments used.', 'gem', '#2d8a5f', false, '{identification}, {weight} ct. Origin {origin}. Report {report_no} dated {date}.', array['GEMSTONE IDENTIFICATION REPORT','Verify with AIGS App'], '[{"key": "report_no", "label": "Report No", "kind": "text", "required": true, "showInList": true, "filterable": false, "role": "report_no", "hints": {"labels": ["Report No", "Report Number"], "pattern": "report_number"}}, {"key": "date", "label": "Date", "kind": "date", "required": false, "showInList": true, "filterable": false, "role": "report_date", "hints": {"labels": ["Date"], "pattern": "date", "cleanup": ["parse_date"]}}, {"key": "weight", "label": "Weight (ct)", "kind": "carat", "required": false, "showInList": true, "filterable": false, "role": "weight", "hints": {"labels": ["Weight", "Carat Weight"], "pattern": "carat"}}, {"key": "shape", "label": "Shape", "kind": "text", "required": false, "showInList": false, "filterable": true, "hints": {"labels": ["Shape"]}}, {"key": "cut", "label": "Cut", "kind": "text", "required": false, "showInList": false, "filterable": true, "hints": {"labels": ["Cut"]}}, {"key": "measurements", "label": "Measurements (mm)", "kind": "text", "required": false, "showInList": false, "filterable": false, "hints": {"labels": ["Measurements", "Dimensions"], "pattern": "mm_size"}}, {"key": "color", "label": "Color", "kind": "text", "required": false, "showInList": false, "filterable": true, "hints": {"labels": ["Color", "Colour"]}}, {"key": "origin", "label": "Origin", "kind": "text", "required": false, "showInList": false, "filterable": true, "hints": {"labels": ["Origin", "Provenance"]}}, {"key": "identification", "label": "Identification", "kind": "text", "required": true, "showInList": true, "filterable": true, "role": "identification", "hints": {"labels": ["Identification", "Species"]}}, {"key": "comments", "label": "Comments", "kind": "longtext", "required": false, "showInList": false, "filterable": false, "hints": {"labels": ["Comments", "Comment"]}}, {"key": "instruments", "label": "Instruments used", "kind": "multiselect", "required": false, "showInList": false, "filterable": false, "options": ["Microscope", "Refractometer", "Spectroscope", "Polariscope", "UV lamp", "FTIR", "Raman", "UV-Vis"]}]'::jsonb, 0),
  ('aigs-analysis-short-report', 'AIGS Analysis Short Report', 'AIGS', 'Short identification check for one or more stones.', 'file-text', '#3a75b1', false, '{identification}, {weight} ct for {customer}. Report {report_no} dated {date}.', array['ANALYSIS SHORT REPORT','Identification Check'], '[{"key": "report_no", "label": "Report No", "kind": "text", "required": true, "showInList": true, "filterable": false, "role": "report_no", "hints": {"labels": ["Report No", "Report Number"], "pattern": "report_number"}}, {"key": "customer", "label": "Customer", "kind": "text", "required": false, "showInList": true, "filterable": true, "role": "customer", "hints": {"labels": ["Customer", "Client"]}}, {"key": "reference", "label": "Reference", "kind": "text", "required": false, "showInList": false, "filterable": false, "hints": {"labels": ["Reference"]}}, {"key": "submitted", "label": "Date of Submission", "kind": "date", "required": false, "showInList": false, "filterable": false, "hints": {"labels": ["Date of Submission"], "pattern": "date", "cleanup": ["parse_date"]}}, {"key": "description", "label": "Description", "kind": "text", "required": false, "showInList": false, "filterable": false, "hints": {"labels": ["Description"]}}, {"key": "weight", "label": "Total weight (cts)", "kind": "carat", "required": false, "showInList": true, "filterable": false, "role": "weight", "hints": {"labels": ["Total weight", "Weight"], "pattern": "carat"}}, {"key": "shape_cut", "label": "Shape and cut", "kind": "text", "required": false, "showInList": false, "filterable": false, "hints": {"labels": ["Shape and cut", "Shape & cut"]}}, {"key": "quantity", "label": "Quantity (pieces)", "kind": "number", "required": false, "showInList": false, "filterable": false, "hints": {"labels": ["Quantity", "Pieces"], "pattern": "integer"}}, {"key": "identification", "label": "Identification", "kind": "text", "required": true, "showInList": true, "filterable": true, "role": "identification", "hints": {"labels": ["Identification"]}}, {"key": "date", "label": "Date of Issue", "kind": "date", "required": false, "showInList": true, "filterable": false, "role": "report_date", "hints": {"labels": ["Date of Issue", "Date"], "pattern": "date", "cleanup": ["parse_date"]}}]'::jsonb, 1),
  ('bellerophon-gemmological-report', 'Bellerophon Gemmological Report', 'Bellerophon', 'Full gemmological report with grading scales.', 'gem', '#7a5bb5', false, '{identification}, {weight} ct, {color}. Origin {origin}. Report {report_no} dated {date}.', array['GEMMOLOGICAL REPORT','Bellerophon'], '[{"key": "report_no", "label": "Report No", "kind": "text", "required": true, "showInList": true, "filterable": false, "role": "report_no", "hints": {"labels": ["Report No", "REPORT No."], "pattern": "report_number"}}, {"key": "date", "label": "Date", "kind": "date", "required": false, "showInList": true, "filterable": false, "role": "report_date", "hints": {"labels": ["Date"], "pattern": "date", "cleanup": ["parse_date"]}}, {"key": "description", "label": "Description", "kind": "text", "required": false, "showInList": false, "filterable": false, "hints": {"labels": ["Description"]}}, {"key": "weight", "label": "Weight (ct)", "kind": "carat", "required": false, "showInList": true, "filterable": false, "role": "weight", "hints": {"labels": ["Weight"], "pattern": "carat"}}, {"key": "measurements", "label": "Measurements", "kind": "text", "required": false, "showInList": false, "filterable": false, "hints": {"labels": ["Measurements"], "pattern": "mm_size"}}, {"key": "cut_shape", "label": "Cut & Shape", "kind": "text", "required": false, "showInList": false, "filterable": true, "hints": {"labels": ["Cut & Shape", "Cut and Shape"]}}, {"key": "identification", "label": "Identification", "kind": "text", "required": true, "showInList": true, "filterable": true, "role": "identification", "hints": {"labels": ["Identification"]}}, {"key": "color", "label": "Color", "kind": "text", "required": false, "showInList": false, "filterable": true, "hints": {"labels": ["Color", "Colour"]}}, {"key": "color_distribution", "label": "Color distribution", "kind": "text", "required": false, "showInList": false, "filterable": false, "hints": {"labels": ["Color Distribution"]}}, {"key": "color_stability", "label": "Color stability", "kind": "text", "required": false, "showInList": false, "filterable": false, "hints": {"labels": ["Color Stability"]}}, {"key": "clarity", "label": "Clarity", "kind": "text", "required": false, "showInList": false, "filterable": true, "hints": {"labels": ["Clarity"]}}, {"key": "fluorescence", "label": "Fluorescence", "kind": "text", "required": false, "showInList": false, "filterable": false, "hints": {"labels": ["Fluorescence"]}}, {"key": "comment", "label": "Comment", "kind": "longtext", "required": false, "showInList": false, "filterable": false, "hints": {"labels": ["Comment", "Comments"]}}, {"key": "origin", "label": "Provenance (origin)", "kind": "text", "required": false, "showInList": false, "filterable": true, "hints": {"labels": ["Provenance", "Origin"]}}, {"key": "age", "label": "Age", "kind": "text", "required": false, "showInList": false, "filterable": false, "hints": {"labels": ["Age"]}}]'::jsonb, 2),
  ('bellerophon-gemmological-testing-results', 'Bellerophon Gemmological Testing Results', 'Bellerophon', 'Batch results table for several stones.', 'table', '#c27a1a', false, '{total_gemstones} gemstones tested. Reference {reference_no} dated {date}.', array['GEMMOLOGICAL TESTING RESULTS','Testing Results'], '[{"key": "reference_no", "label": "Reference No", "kind": "text", "required": true, "showInList": true, "filterable": false, "role": "report_no", "hints": {"labels": ["Reference N°", "Reference No", "Reference"]}}, {"key": "date", "label": "Date", "kind": "date", "required": false, "showInList": true, "filterable": false, "role": "report_date", "hints": {"labels": ["Date"], "pattern": "date", "cleanup": ["parse_date"]}}, {"key": "total_gemstones", "label": "Total gemstones", "kind": "number", "required": false, "showInList": true, "filterable": false, "hints": {"labels": ["Total gemstones", "Gemstones"], "pattern": "integer"}}, {"key": "tested_for", "label": "Tested for", "kind": "longtext", "required": false, "showInList": false, "filterable": false, "hints": {"labels": ["Tested for"]}}, {"key": "methods", "label": "Methods", "kind": "longtext", "required": false, "showInList": false, "filterable": false, "hints": {"labels": ["Methods"]}}, {"key": "results", "label": "Results", "kind": "table", "required": false, "showInList": false, "filterable": false, "columns": [{"key": "item_no", "label": "Item No", "kind": "text", "required": false, "showInList": false, "filterable": false}, {"key": "carat", "label": "Carat", "kind": "carat", "required": false, "showInList": false, "filterable": false}, {"key": "identification", "label": "Identification", "kind": "text", "required": false, "showInList": false, "filterable": false}, {"key": "comment", "label": "Comment (treatment)", "kind": "text", "required": false, "showInList": false, "filterable": false}, {"key": "pieces", "label": "Pieces", "kind": "number", "required": false, "showInList": false, "filterable": false}]}]'::jsonb, 3)
on conflict (slug) do nothing;
