-- Labels each row with where it came from (e.g. "CSV: filename.csv" or "Pipedrive") so the Data
-- Management view can show a meaningful history list per import batch, not just a bare UUID/date.
alter table marketing_deals add column import_source text;
