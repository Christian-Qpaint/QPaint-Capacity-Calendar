-- Stores the Pipedrive deal's own title verbatim (e.g. "41466 - 11 Dawson Street, Yeerongpilly
-- (Genivieve Place CTS27991)") so the Jobs List can display it exactly as Pipedrive names it,
-- Quote ID prefix and any custom suffix included, rather than reconstructing it from the
-- separately-synced address field.
alter table jobs add column pipedrive_deal_title text;

-- Appended after pipedrive_stage_id, not before — CREATE OR REPLACE VIEW matches columns
-- positionally, so a new column must always go last or it renames an existing one instead of adding.
create or replace view jobs_view with (security_invoker = true) as
  select
    id, pipedrive_deal_id, client_id, address, category, target_hours, date_won,
    case when is_office_role() then total_value else null end as total_value,
    pipedrive_stage_id,
    pipedrive_deal_title
  from jobs;
