-- Lets the Scheduler's Team/Contractor rows be manually reordered (drag-to-sort) and have that
-- order persist. Nullable — every existing row defaults to no explicit order (falls back to
-- whatever order it was already rendering in) until someone actually drags it.
alter table teams add column display_order integer;
alter table contractors add column display_order integer;
