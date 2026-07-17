-- Exposes the new Contractor detail columns through contractors_view. New columns are appended
-- after the existing two (id, name, reported_monthly_capacity) — CREATE OR REPLACE VIEW matches
-- columns positionally, so anything new must go at the end, not before/between existing ones
-- (see the same lesson in 0003_pipedrive_stage.sql).
--
-- The masking on name/reported_monthly_capacity was already redundant — contractors_select_office
-- restricts the base table to office roles only, so no caller ever reaches this view without
-- already being office-tier — but it's left in place as defense-in-depth rather than removed.
create or replace view contractors_view with (security_invoker = true) as
  select
    id,
    case when is_office_role() then name else null end as name,
    case when is_office_role() then reported_monthly_capacity else null end as reported_monthly_capacity,
    trading_name, abn, acn, gst_registered, licence_category, address, suburb, state, postcode,
    primary_contact_name, primary_contact_mobile, primary_contact_email, preferred_area,
    after_hours_available, own_equipment, own_transport, years_experience,
    reference_1_name, reference_1_phone, reference_2_name, reference_2_phone,
    approved, active, last_updated
  from contractors;
