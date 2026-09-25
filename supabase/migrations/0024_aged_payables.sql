-- Imported "Aged Payables Detail" reports from Xero, backing the Finance page's real payables
-- data. One row per import, keyed by the report's "as at" date — re-importing the same date
-- replaces that report's lines wholesale (a re-upload is a correction, not a new snapshot).
create table aged_payables_reports (
  id uuid primary key default gen_random_uuid(),
  as_at_date date not null,
  grand_total numeric not null default 0,
  imported_at timestamptz not null default now(),
  constraint aged_payables_reports_as_at_date_key unique (as_at_date)
);

-- bucket0..bucket3 mirror Xero's own "current month, then 3 months back" columns; which calendar
-- month each represents is computed from the report's as_at_date, not stored per line.
create table aged_payables_lines (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references aged_payables_reports(id) on delete cascade,
  sort_order integer not null,
  vendor_name text not null,
  invoice_date date,
  due_date date,
  invoice_reference text,
  bucket_0 numeric not null default 0,
  bucket_1 numeric not null default 0,
  bucket_2 numeric not null default 0,
  bucket_3 numeric not null default 0,
  bucket_older numeric not null default 0,
  total numeric not null default 0
);

create index aged_payables_lines_report_id_idx on aged_payables_lines (report_id);
