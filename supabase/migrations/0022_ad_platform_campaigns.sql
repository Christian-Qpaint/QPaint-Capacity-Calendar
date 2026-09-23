-- Raw per-campaign ad spend data pulled straight from each ad platform's own API (Meta first,
-- Google Ads later), backing the Ads Management page. One row per (platform, month, campaign) —
-- a sync deletes the existing rows for the (platform, month) it just re-fetched and inserts the
-- fresh pull, so history across months stays consolidated while a re-synced month is always a
-- full replacement (ad platforms revise conversion/attribution numbers for a window after a
-- month closes, so overwriting on re-sync is correct, not a bug).
create table ad_platform_campaigns (
  id uuid primary key default gen_random_uuid(),
  platform text not null,
  month text not null,
  campaign_id text not null,
  source text not null,
  spend numeric not null default 0,
  impressions integer not null default 0,
  reach integer,
  frequency numeric,
  clicks integer not null default 0,
  cpc numeric,
  ctr numeric,
  cpm numeric,
  leads integer,
  currency text not null default 'AUD',
  date_start date not null,
  date_stop date not null,
  updated_at timestamptz not null default now(),
  constraint ad_platform_campaigns_platform_month_campaign_key unique (platform, month, campaign_id)
);

create index ad_platform_campaigns_platform_month_idx on ad_platform_campaigns (platform, month);
