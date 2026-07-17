-- Imports the 8 contractor companies from QPaint_Contractor_Master_Template.pdf.
--
-- Deliberately NOT imported: bank BSB/Account numbers, driver's licence numbers — excluded on
-- principle, not because the source lacked them.
--
-- reported_monthly_capacity defaults to 0 for all 8 — the source PDF has no $ capacity figure;
-- someone needs to set real figures via the Setup screen before the Capacity Board math means
-- anything for these contractors.
--
-- Rows for PPP Painting, Brisbane Contract Painters, Coverage By Design, and Your Projects Pty Ltd
-- were noticeably sparser/more ambiguous in the source than the first four — double-check those
-- four in particular.

insert into contractors (id, name, trading_name, reported_monthly_capacity, abn, acn, gst_registered,
  licence_category, address, suburb, state, postcode, primary_contact_name, primary_contact_mobile,
  primary_contact_email, preferred_area, after_hours_available, own_equipment, own_transport,
  years_experience, reference_1_name, reference_1_phone, reference_2_name, reference_2_phone,
  approved, active, last_updated)
values
  ('c1a11111-1111-4111-8111-111111111111', 'Brisbane City Extreme Painting Pty Ltd',
   'Brisbane City Extreme Painting Pty Ltd ATF Haddad Family Trust', 0,
   '97 799 430 825', '654 158 871', true, 'Painting & Decorating',
   '10 Brierbank Street', 'Underwood', 'QLD', '4119',
   'Maatassem Haddad', '0459106258', 'mattpainting@outlook.com',
   'Brisbane & Gold Coast', 'Yes', 'Yes', 'Yes', 20,
   'Sam', '049959729', 'Alestar Hart', '0421920094',
   'Yes', 'Yes', '2026-07-03'),

  ('c2a22222-2222-4222-8222-222222222222', 'Calm Oceans Pty Ltd as Trustee for Calm Oceans Trust',
   'Inspired Painting & Decorating', 0,
   '69 126 385 536', '104 314 785', true, 'Painting & Decorating',
   '8/82 Hutchinson Street', 'Burleigh Heads', 'QLD', '4220',
   'Clint O''Mahoney', '0422081809', 'office@inspiredpaintingdecorating.com.au',
   'Gold Coast', 'Possibly (upon request)', 'Yes', 'Yes', 16,
   'Tas Moulis', null, 'Shane McAuliffe', null,
   'Pending', 'Yes', '2026-07-06'),

  ('c3a33333-3333-4333-8333-333333333333', 'CS Painting', 'Cornel Painting', 0,
   '35 507 461 974', null, true, 'Painting & Decorating',
   '421-423 Spring Mountain Drive', 'Greenbank', 'QLD', '4124',
   'Cornel Straton', '0410 421 235', 'cornelpainting@outlook.com',
   'Greenbank / SEQ', null, null, null, null,
   null, null, null, null,
   'No - hold', 'No - hold', '2026-07-06'),

  ('c4a44444-4444-4444-8444-444444444444', 'Sea Breeze Painting Sunshine Coast Pty Ltd',
   'Sea Breeze Painting Sunshine Coast Pty Ltd', 0,
   '33 659 306 742', '659 306 742', true, 'Painting & Decorating',
   '1 Karkawarri Court', 'Buddina', 'QLD', '4575',
   'Craig Bailey (also: Travis Large)', '0427087588', 'CBailey_seabreezepainting@outlook.co',
   'Sunshine Coast', null, null, null, null,
   null, null, null, null,
   'No - hold', 'No - hold', '2026-07-06'),

  ('c5a55555-5555-4555-8555-555555555555', 'PPP Painting',
   'The trustee for Andrew & Narissa Family Trust / Andrews Painting Crew', 0,
   '79 110 943 282', null, true, 'Painting & Decorating',
   '99 Ryhill Road', 'Sunnybank Hills', 'QLD', '4109',
   'Andrew Hlaing', '0450 585 145', null,
   null, null, null, null, null,
   null, null, null, null,
   null, null, null),

  ('c6a66666-6666-4666-8666-666666666666', 'Brisbane Contract Painters', 'Brisbane Contract Painters', 0,
   '93 547 496 690', null, true, null,
   '98 Stewart Road', 'Ashgrove', 'QLD', null,
   'Gary Wilson', '0409 069 641', 'gary@appliedpainting.com.au',
   null, null, null, null, null,
   null, null, null, null,
   'Yes', 'Yes', '2028-04-06'),

  ('c7a77777-7777-4777-8777-777777777777', 'Coverage By Design Pty Ltd', 'Coverage by Design Painters', 0,
   '65 610 359 352', '610 359 352', true, 'Painting & Decorating (Trade Contractor Licence)',
   '36 Summit Cres', 'Carrara', 'QLD', '4211',
   'Director on QBCC record: Victor Tomas Carcoba Alcantara', null, null,
   'Gold Coast', null, null, null, null,
   null, null, null, null,
   'No - hold', 'No - hold', '2026-07-06'),

  ('c8a88888-8888-4888-8888-888888888888', 'Your Projects Pty Ltd', 'Building Repair Group', 0,
   '80 639 683 515', '639 683 515', true, 'Painter / Builder / Carpenter',
   'Unit 2, 10 Combarton Street', 'Brendale', 'QLD', '4500',
   'Antony Blake or Melissa Lau', '1300343534', 'brisbane@building-repairs.com',
   null, null, null, null, null,
   null, null, null, null,
   null, null, null);

-- Credentials — QBCC Licence, WorkCover, Public Liability, White Card, Blue Card, QBuild WHS
-- Induction. Rows with no clear number/expiry in the source use NULL (surfaces as the "grey /
-- data missing" compliance state, per the existing compliance flag logic — not silently dropped).

insert into credentials (contractor_id, credential_type, number, issuer, expiry_date, coverage_amount, job_type_scope) values
  -- Brisbane City Extreme Painting
  ('c1a11111-1111-4111-8111-111111111111', 'Licence', '15480885', 'QBCC', '2028-12-09', null, null),
  ('c1a11111-1111-4111-8111-111111111111', 'WorkCover', 'WSM260176098', null, '2026-09-30', null, null),
  ('c1a11111-1111-4111-8111-111111111111', 'Public Liability', '33 YTI 4110954', 'WFI', '2027-02-18', 20000000, null),
  ('c1a11111-1111-4111-8111-111111111111', 'White Card', null, null, null, null, null),
  ('c1a11111-1111-4111-8111-111111111111', 'Blue Card', null, null, null, null, null),

  -- Calm Oceans / Inspired Painting & Decorating
  ('c2a22222-2222-4222-8222-222222222222', 'Licence', '1280455', 'QBCC', '2027-07-11', null, null),
  ('c2a22222-2222-4222-8222-222222222222', 'WorkCover', 'WAD150775085', null, '2026-09-30', null, null),
  ('c2a22222-2222-4222-8222-222222222222', 'Public Liability', 'GA700542105BUSP', 'Hollard (via HCI)', '2026-07-31', 20000000, null),
  ('c2a22222-2222-4222-8222-222222222222', 'White Card', null, null, null, null, null),

  -- CS Painting / Cornel Painting
  ('c3a33333-3333-4333-8333-333333333333', 'Licence', '1125600', 'QBCC', '2025-01-05', null, null),
  ('c3a33333-3333-4333-8333-333333333333', 'Public Liability', 'DSU315891BPK', null, '2025-09-09', 5000000, null),
  ('c3a33333-3333-4333-8333-333333333333', 'White Card', '10643132', 'WA', null, null, null),
  ('c3a33333-3333-4333-8333-333333333333', 'Blue Card', '#2004124/1', null, null, null, null),
  ('c3a33333-3333-4333-8333-333333333333', 'WHS Induction', null, 'QBuild', '2028-06-25', null, 'Government'),

  -- Sea Breeze Painting Sunshine Coast
  ('c4a44444-4444-4444-8444-444444444444', 'Licence', '1241723', 'QBCC', null, null, null),
  ('c4a44444-4444-4444-8444-444444444444', 'WorkCover', 'WSM220872170', null, '2026-09-30', null, null),
  ('c4a44444-4444-4444-8444-444444444444', 'Public Liability', 'TP245142', 'Lloyd''s (Asta Managing Agency Synd. 4747) via High Street Underwriting', '2026-10-10', 5000000, null),
  ('c4a44444-4444-4444-8444-444444444444', 'WHS Induction', 'Craig Bailey', 'QBuild', '2026-12-10', null, 'Government'),
  ('c4a44444-4444-4444-8444-444444444444', 'WHS Induction', 'Travis Large', 'QBuild', '2027-01-04', null, 'Government'),

  -- PPP Painting
  ('c5a55555-5555-4555-8555-555555555555', 'Licence', '15015793', 'QBCC', '2027-08-30', null, null),
  ('c5a55555-5555-4555-8555-555555555555', 'Public Liability', 'BP 4201351 / QD1', 'NRMA Insurance', '2026-07-16', 20000000, null),
  ('c5a55555-5555-4555-8555-555555555555', 'White Card', null, null, null, null, null),

  -- Brisbane Contract Painters
  ('c6a66666-6666-4666-8666-666666666666', 'WorkCover', 'WSM230802641', null, '2025-09-30', null, null),

  -- Coverage By Design (essentially no compliance data on file — flagged "on hold" in the source)
  ('c7a77777-7777-4777-8777-777777777777', 'Licence', '15189108', 'QBCC', null, null, null),

  -- Your Projects Pty Ltd / Building Repair Group
  ('c8a88888-8888-4888-8888-888888888888', 'Licence', '15188700', 'QBCC', null, null, null),
  ('c8a88888-8888-4888-8888-888888888888', 'WorkCover', 'WPR200399588', null, '2025-06-30', null, null),
  ('c8a88888-8888-4888-8888-888888888888', 'Public Liability', '02U260276BPK', 'QBE Insurance', '2025-06-01', 20000000, null),
  ('c8a88888-8888-4888-8888-888888888888', 'White Card', null, null, null, null, null),
  ('c8a88888-8888-4888-8888-888888888888', 'Blue Card', null, null, null, null, null);
