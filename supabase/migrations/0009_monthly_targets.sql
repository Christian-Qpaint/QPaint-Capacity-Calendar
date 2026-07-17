-- Manually-set monthly $ targets, replacing the old auto-computed (team capacity x rate +
-- contractor safety target) figure on the Capacity Board's top-line tiles — lets the business
-- account for seasonal swings instead of a formula-derived number. The per-team/contractor
-- capacity bars further down the Capacity Board are untouched and keep using their own formulas.
create table monthly_targets (
  id uuid primary key default gen_random_uuid(),
  year integer not null,
  month integer not null check (month between 1 and 12),
  target_dollars numeric not null default 0,
  updated_at timestamptz not null default now(),
  unique (year, month)
);

-- End-of-month "Actual vs Target" snapshot, captured manually via a "Take snapshot" button.
-- actual_dollars mirrors the same $ figure the live dashboard calls "Scheduled" for that window
-- (see get_scheduled_dollars_in_window equivalent in src/lib/dataAccess.ts) — captured at a point
-- in time so historical comparisons don't silently shift if schedule data changes later.
create table monthly_snapshots (
  id uuid primary key default gen_random_uuid(),
  year integer not null,
  month integer not null check (month between 1 and 12),
  target_dollars numeric not null,
  actual_dollars numeric not null,
  captured_at timestamptz not null default now(),
  captured_by uuid references auth.users (id),
  unique (year, month)
);

alter table monthly_targets enable row level security;
alter table monthly_snapshots enable row level security;

-- Financial figures — office-only read (matches jobs_view/contractors_view/weekly_actuals);
-- write restricted to Owner/Ops Manager (is_full_tier_role()), per the Decision Log's existing
-- Full-tier gating used for Credentials and Ranking edits.
create policy "monthly_targets_select_office" on monthly_targets for select to authenticated using (is_office_role());
create policy "monthly_targets_write_full_tier" on monthly_targets for all to authenticated using (is_full_tier_role()) with check (is_full_tier_role());

create policy "monthly_snapshots_select_office" on monthly_snapshots for select to authenticated using (is_office_role());
create policy "monthly_snapshots_write_full_tier" on monthly_snapshots for all to authenticated using (is_full_tier_role()) with check (is_full_tier_role());
