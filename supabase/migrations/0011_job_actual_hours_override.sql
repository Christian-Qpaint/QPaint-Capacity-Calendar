-- Actual/Logged Hours for a job is normally computed automatically from real crew-logged hours
-- (daily_hours_entries against the job's schedule blocks) — there is no Pipedrive field for hours
-- actually worked, Pipedrive is a sales CRM. Until crew logging is fully adopted, office staff can
-- manually type a truer figure per job; that override sticks until someone explicitly resyncs
-- (clears the override so it goes back to the computed/logged total).
alter table jobs add column actual_hours_override numeric;
alter table jobs add column actual_hours_source text not null default 'computed' check (actual_hours_source in ('computed', 'manual'));

-- Appended after pipedrive_deal_title (the current final column) — CREATE OR REPLACE VIEW matches
-- columns positionally, so new columns must always go last or they rename/drop an existing one.
create or replace view jobs_view with (security_invoker = true) as
  select
    id, pipedrive_deal_id, client_id, address, category, target_hours, date_won,
    case when is_office_role() then total_value else null end as total_value,
    pipedrive_stage_id,
    pipedrive_deal_title,
    actual_hours_override,
    actual_hours_source
  from jobs;
