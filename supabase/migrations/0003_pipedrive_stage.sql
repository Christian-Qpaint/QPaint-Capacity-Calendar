-- Tracks which Pipedrive Jobs Pipeline stage a synced deal currently sits in. We keep the job row
-- (and all its Schedule Blocks / hours history) even after it moves past the stages the Jobs List
-- cares about — deleting it would destroy real scheduling history just because a Pipedrive card
-- moved. Instead the Jobs List query filters on this column; the row itself is never removed by sync.
alter table jobs add column pipedrive_stage_id integer;

-- jobs_view needs the new column too since the frontend reads jobs through it, not the base table.
-- CREATE OR REPLACE VIEW only allows appending new columns at the end (Postgres matches existing
-- columns positionally) — pipedrive_stage_id must come after total_value, not before it, or it
-- reads as renaming the existing total_value column instead of adding a new one.
create or replace view jobs_view with (security_invoker = true) as
  select
    id, pipedrive_deal_id, client_id, address, category, target_hours, date_won,
    case when is_office_role() then total_value else null end as total_value,
    pipedrive_stage_id
  from jobs;
