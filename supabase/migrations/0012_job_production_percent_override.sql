-- Production % is normally computed from each phase's Progress% weighted by that phase's $ value
-- (see getJobProgress in src/lib/dataAccess.ts). Same override pattern as Actual Hours (migration
-- 0011): office staff can manually type a truer completion % per job; it sticks until someone
-- explicitly resyncs (clears the override so it goes back to the computed figure).
alter table jobs add column production_percent_override numeric;
alter table jobs add column production_percent_source text not null default 'computed' check (production_percent_source in ('computed', 'manual'));

-- Appended after actual_hours_source (the current final column) — CREATE OR REPLACE VIEW matches
-- columns positionally, so new columns must always go last or they rename/drop an existing one.
create or replace view jobs_view with (security_invoker = true) as
  select
    id, pipedrive_deal_id, client_id, address, category, target_hours, date_won,
    case when is_office_role() then total_value else null end as total_value,
    pipedrive_stage_id,
    pipedrive_deal_title,
    actual_hours_override,
    actual_hours_source,
    production_percent_override,
    production_percent_source
  from jobs;
