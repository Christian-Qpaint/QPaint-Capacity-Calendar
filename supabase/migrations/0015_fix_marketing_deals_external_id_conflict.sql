-- The partial unique index from 0014 (external_id) WHERE external_id IS NOT NULL doesn't satisfy
-- PostgREST's upsert on_conflict=external_id target — Postgres requires an unconditional unique
-- constraint for a plain ON CONFLICT (column) clause, and a partial index doesn't qualify
-- ("42P10: no unique or exclusion constraint matching the ON CONFLICT specification"), so every
-- CSV import upsert was failing. A full unique constraint still permits multiple NULL external_id
-- rows (NULL is never equal to NULL for uniqueness), so it doesn't reintroduce duplicates among
-- manually-entered/no-id rows.
drop index marketing_deals_external_id_unique;
alter table marketing_deals add constraint marketing_deals_external_id_key unique (external_id);
