-- Workers gain the personal / employment / compliance detail QPaint keeps on its "Team Info"
-- sheet: date of birth, start date, driver's licence (+ expiry), White Card issue date, the date a
-- QBuild induction was completed, and any other licences/tickets (Blue Card, EWP, High Risk Work…)
-- with their numbers and expiry dates. All optional — an existing worker keeps working unchanged.
alter table workers add column date_of_birth date;
alter table workers add column start_date date;
alter table workers add column drivers_licence_number text not null default '';
alter table workers add column drivers_licence_expiry date;
alter table workers add column white_card_issue_date date;
alter table workers add column qbuild_induction_date date;
alter table workers add column other_tickets jsonb not null default '[]'::jsonb;
