-- Marketing module: measures marketing effectiveness/ROI by combining ad spend with CRM deal
-- data (Leads/Quotes/Jobs Won). This is a business-owner-facing analysis screen, not an
-- operational one, so it's gated to its own role check rather than is_office_role().
create function can_access_marketing() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(current_role_name() in ('owner', 'marketing'), false);
$$;

-- Manual monthly ad spend by referral source — v1 input until Google Ads/Meta Ads APIs are wired
-- up later (see marketing_deals below for the same "manual now, API-fed later" shape).
create table ad_spend (
  id uuid primary key default gen_random_uuid(),
  month date not null, -- always the 1st of the month, e.g. 2026-07-01
  referral_source text not null,
  amount numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (month, referral_source)
);

-- One row per CRM deal (Lead/Quote/Won), populated via the CSV/Excel import from Pipedrive
-- exports. is_quoted/is_won are explicit booleans set during the import's stage-classification
-- step, rather than inferred from a raw stage string — so the KPI math never has to guess this
-- account's exact pipeline stage names or assume a strict stage ordering.
create table marketing_deals (
  id uuid primary key default gen_random_uuid(),
  external_id text, -- Pipedrive deal id, when present — lets a re-import update rather than duplicate
  title text,
  referral_source text not null default 'Other',
  salesperson text,
  raw_stage text, -- the CSV's own stage/status text, kept verbatim for the Stage filter and reference
  is_quoted boolean not null default false,
  is_won boolean not null default false,
  value numeric not null default 0,
  created_date date not null,
  event_date date, -- date most relevant to this row's current state (won date if won, else created date)
  import_batch_id uuid not null,
  imported_at timestamptz not null default now()
);

-- Supports upsert-on-reimport (ON CONFLICT (external_id)) without blocking rows that have no
-- external_id at all (manually-entered or an export column that wasn't included).
create unique index marketing_deals_external_id_unique on marketing_deals (external_id) where external_id is not null;
create index marketing_deals_import_batch_idx on marketing_deals (import_batch_id);

alter table ad_spend enable row level security;
alter table marketing_deals enable row level security;

create policy "ad_spend_all_marketing" on ad_spend for all to authenticated using (can_access_marketing()) with check (can_access_marketing());
create policy "marketing_deals_all_marketing" on marketing_deals for all to authenticated using (can_access_marketing()) with check (can_access_marketing());
