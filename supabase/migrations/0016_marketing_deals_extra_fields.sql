-- Rounds out marketing_deals to match every column in QPaint's standard Pipedrive "Deals Insights"
-- CSV export, not just the ones needed for the KPI formulas — Pipeline/Lost reason/Expected close
-- date aren't used in any calculation yet, but are worth keeping verbatim from the source export.
alter table marketing_deals
  add column pipeline text,
  add column lost_reason text,
  add column expected_close_date date;
