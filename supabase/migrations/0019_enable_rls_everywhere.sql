-- Critical security fix: every table in the public schema currently has Row-Level Security
-- disabled, and Supabase's default anon/authenticated PostgREST roles hold full SELECT/INSERT/
-- UPDATE/DELETE grants on all of them (confirmed live against production, flagged by Supabase's
-- own security scanner as "rls_disabled_in_public" + "sensitive_columns_exposed" -
-- users.password_hash and user_invites.token were both publicly readable via the REST API using
-- only the public anon key embedded in the frontend bundle).
--
-- This app does all of its real data access through Netlify Functions connecting directly to
-- Postgres via the `postgres` role, which has BYPASSRLS (confirmed: `select rolbypassrls from
-- pg_roles where rolname = 'postgres'` returns true) - enabling RLS here has zero effect on the
-- app's own backend. The only Supabase client-SDK usage anywhere in the frontend is one RPC call
-- (get_production_pace, see 0002_production_pace_rpc.sql), which is SECURITY DEFINER and always
-- bypasses RLS on the tables it queries internally regardless of the caller's own row access.
--
-- Enabling RLS with NO policies defined is a deliberate default-deny: any role without BYPASSRLS
-- (i.e. anon, authenticated) gets zero visible/writable rows on every one of these tables, fully
-- closing the public REST API exposure without touching the existing grants or app behavior.
--
-- IMPORTANT for anyone adding a new public table in a future migration: Postgres does NOT enable
-- RLS by default on a newly created table, and Supabase's PostgREST layer exposes every public
-- table by default regardless of whether the app intends to use the REST API for it - always add
-- `ALTER TABLE <new_table> ENABLE ROW LEVEL SECURITY;` in the same migration that creates it.

alter table ad_spend enable row level security;
alter table clients enable row level security;
alter table contractors enable row level security;
alter table credentials enable row level security;
alter table crm_deal_stage_history enable row level security;
alter table crm_deals enable row level security;
alter table crm_field_definitions enable row level security;
alter table crm_pipelines enable row level security;
alter table crm_saved_filters enable row level security;
alter table crm_stages enable row level security;
alter table daily_hours_entries enable row level security;
alter table jobs enable row level security;
alter table marketing_deals enable row level security;
alter table monthly_snapshots enable row level security;
alter table monthly_targets enable row level security;
alter table notifications enable row level security;
alter table schedule_blocks enable row level security;
alter table team_memberships enable row level security;
alter table teams enable row level security;
alter table user_invites enable row level security;
alter table user_permission_overrides enable row level security;
alter table users enable row level security;
alter table weekly_actuals enable row level security;
alter table workers enable row level security;
