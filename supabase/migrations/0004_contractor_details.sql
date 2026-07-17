-- Extends Contractor with the "Full tier" directory fields from the Contractor & Staff Management
-- Decision Log (Decision 20) that were designed but never actually given columns — ABN/ACN/GST,
-- address, years experience, references, approved/active status. Deliberately still excludes
-- banking (BSB/Account) — this app has no legitimate need to hold bank account credentials, and it
-- won't be populated from any future import either.
--
-- Soft-status fields (approved, active, own_equipment, own_transport, after_hours_available) are
-- TEXT, not boolean — real contractor records legitimately hold values like "Pending", "No - hold",
-- or "Possibly (upon request)" that a boolean would lose.
alter table contractors add column trading_name text;
alter table contractors add column abn text;
alter table contractors add column acn text;
alter table contractors add column gst_registered boolean;
alter table contractors add column licence_category text;
alter table contractors add column address text;
alter table contractors add column suburb text;
alter table contractors add column state text;
alter table contractors add column postcode text;
alter table contractors add column primary_contact_name text;
alter table contractors add column primary_contact_mobile text;
alter table contractors add column primary_contact_email text;
alter table contractors add column preferred_area text;
alter table contractors add column after_hours_available text;
alter table contractors add column own_equipment text;
alter table contractors add column own_transport text;
alter table contractors add column years_experience integer;
alter table contractors add column reference_1_name text;
alter table contractors add column reference_1_phone text;
alter table contractors add column reference_2_name text;
alter table contractors add column reference_2_phone text;
alter table contractors add column approved text;
alter table contractors add column active text;
alter table contractors add column last_updated date;

-- Credentials needs an issuer name (insurer/QBCC etc.) and a $ cover amount for insurance-type
-- rows, and real records frequently lack a card/policy number or a known expiry — both become
-- nullable rather than forcing a placeholder value into a compliance-critical field.
alter table credentials add column issuer text;
alter table credentials add column coverage_amount numeric;
alter table credentials alter column number drop not null;
alter table credentials alter column expiry_date drop not null;

-- Two more credential types this real data distinguishes as separate policies with separate
-- expiries, rather than lumping both under the existing generic "Insurance" value.
alter type credential_type add value 'WorkCover';
alter type credential_type add value 'Public Liability';
