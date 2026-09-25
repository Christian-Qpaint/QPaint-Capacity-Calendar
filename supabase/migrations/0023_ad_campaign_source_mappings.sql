-- Manual, one-time link from an ad-platform campaign to a QPaint referral source. Campaign names
-- (Meta's, eventually Google's) don't match Pipedrive referral source names, so there's nothing to
-- auto-match on — this is what a person picks once from the Ad Spend dialog when adding spend for
-- a not-yet-mapped campaign, remembered from then on rather than re-asked every month.
create table ad_campaign_source_mappings (
  id uuid primary key default gen_random_uuid(),
  platform text not null,
  campaign_id text not null,
  source text not null,
  referral_source text not null,
  created_at timestamptz not null default now(),
  constraint ad_campaign_source_mappings_platform_campaign_key unique (platform, campaign_id)
);
