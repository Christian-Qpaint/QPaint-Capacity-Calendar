-- Contractors often trade under a shorter/friendlier name than their legal name (e.g. legal name
-- "Craig Thompson Painting Pty Ltd", nickname "Craig"). Scheduling views (Calendar, Capacity Board,
-- Assignment Modal) show the nickname when set; reports/exports/contracts keep using the legal name.
alter table contractors add column nickname text;

-- Appended after last_updated (the current final column) — CREATE OR REPLACE VIEW matches columns
-- positionally, so a new column must always go last or it renames/drops an existing one instead of
-- adding. Masked the same way as `name` for consistency, even though the table's own RLS policy
-- already restricts every row to office roles.
create or replace view contractors_view with (security_invoker = true) as
  select
    id,
    case when is_office_role() then name else null end as name,
    case when is_office_role() then reported_monthly_capacity else null end as reported_monthly_capacity,
    trading_name,
    abn,
    acn,
    gst_registered,
    licence_category,
    address,
    suburb,
    state,
    postcode,
    primary_contact_name,
    primary_contact_mobile,
    primary_contact_email,
    preferred_area,
    after_hours_available,
    own_equipment,
    own_transport,
    years_experience,
    reference_1_name,
    reference_1_phone,
    reference_2_name,
    reference_2_phone,
    approved,
    active,
    last_updated,
    case when is_office_role() then nickname else null end as nickname
  from contractors;
