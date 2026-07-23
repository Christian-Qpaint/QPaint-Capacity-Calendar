-- New role for the Marketing module — kept in its own migration (not combined with the tables/
-- policies that reference it) because Postgres won't let a newly-added enum value be used inside
-- the same transaction that added it.
alter type app_role add value 'marketing';
