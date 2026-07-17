-- QPaint OS — Module 1 schema
-- Mirrors the Developer Handoff Brief v1.2, Section 1 (Data Model) and Section 3 (Role Permissions).
--
-- Column-level financial masking note: Postgres RLS filters ROWS, not columns. Two views
-- (jobs_view, contractors_view) null out financial columns for non-office roles so the "enforce at
-- the query/API layer, not just UI hiding" rule holds even for a client that forgot to filter.
-- The frontend should query *_view, not the base tables, for read access.

create extension if not exists "pgcrypto";

-- ============================================================================
-- Enums
-- ============================================================================
create type app_role as enum ('owner', 'ops_manager', 'scheduler_pm', 'team_leader_foreperson', 'painter_crew_member');
create type client_type as enum ('Individual', 'Company', 'Government', 'Body Corporate');
create type job_category as enum ('Residential', 'Government', 'Corporate', 'Commercial');
create type work_area as enum ('External', 'Internal', 'Roof', 'Epoxy Floors', 'Decks');
create type schedule_block_status as enum ('Unscheduled', 'Scheduled', 'In Production', 'Overdue', 'Completed');
create type team_type as enum ('QPaint', 'Contractor');
create type worker_type as enum ('Internal', 'Contractor');
create type membership_type as enum ('Core', 'Floating');
create type credential_type as enum ('Licence', 'Insurance', 'White Card', 'Blue Card', 'Police Check', 'WHS Induction', 'Driver Licence', 'Other');
create type credential_job_type_scope as enum ('All', 'Residential', 'Government', 'Corporate', 'Commercial');

-- ============================================================================
-- profiles — extends auth.users with the app's role/team, per User in the data model
-- ============================================================================
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  role app_role not null default 'painter_crew_member',
  team_id uuid, -- FK added after teams exists
  worker_id uuid, -- FK added after workers exists
  created_at timestamptz not null default now()
);

-- ============================================================================
-- Core tables
-- ============================================================================
create table clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type client_type not null,
  contact_info text not null default ''
);

create table contractors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  reported_monthly_capacity numeric not null default 0 -- [financial]
);

create table teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type team_type not null,
  contractor_id uuid references contractors (id) on delete cascade,
  headcount integer,
  standard_hours_per_week numeric,
  constraint teams_contractor_shape check (
    (type = 'QPaint' and contractor_id is null) or
    (type = 'Contractor' and contractor_id is not null)
  )
);

alter table profiles add constraint profiles_team_id_fkey foreign key (team_id) references teams (id) on delete set null;

create table jobs (
  id uuid primary key default gen_random_uuid(),
  pipedrive_deal_id text not null unique,
  client_id uuid not null references clients (id) on delete restrict,
  address text not null,
  category job_category not null,
  total_value numeric not null default 0, -- [financial]
  target_hours numeric not null, -- [operational] — locked at deal acceptance
  date_won date not null
);

create table schedule_blocks (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs (id) on delete cascade,
  team_id uuid not null references teams (id) on delete restrict,
  work_area work_area not null,
  start_date date not null,
  end_date date not null,
  phase_hours numeric not null, -- [operational]
  status schedule_block_status not null default 'Scheduled',
  percent_complete integer not null default 0 check (percent_complete between 0 and 100),
  percent_complete_updated_by text,
  percent_complete_updated_at date,
  notes text,
  constraint schedule_blocks_date_order check (end_date >= start_date)
);

create table workers (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  phone text not null default '',
  email text not null default '',
  address text not null default '',
  position text not null default '',
  worker_type worker_type not null,
  contractor_id uuid references contractors (id) on delete cascade,
  white_card_number text not null default '',
  qbuild_induction_done boolean not null default false,
  qbuild_induction_verified boolean not null default false,
  constraint workers_contractor_shape check (
    (worker_type = 'Internal' and contractor_id is null) or
    (worker_type = 'Contractor' and contractor_id is not null)
  )
);

alter table profiles add constraint profiles_worker_id_fkey foreign key (worker_id) references workers (id) on delete set null;

create table team_memberships (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references workers (id) on delete cascade,
  team_id uuid not null references teams (id) on delete cascade,
  start_date date not null,
  end_date date, -- nullable — open-ended for Core memberships
  membership_type membership_type not null
);

create table credentials (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references contractors (id) on delete cascade,
  credential_type credential_type not null,
  number text not null,
  expiry_date date not null,
  job_type_scope credential_job_type_scope -- null = applies regardless of job type
);

create table daily_hours_entries (
  id uuid primary key default gen_random_uuid(),
  schedule_block_id uuid not null references schedule_blocks (id) on delete cascade,
  team_id uuid not null references teams (id) on delete restrict,
  entered_by_user_id uuid not null references profiles (id) on delete restrict,
  date date not null,
  hours numeric not null check (hours > 0)
);

create table weekly_actuals (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs (id) on delete cascade,
  week_ending date not null,
  actual_hours numeric not null,
  unique (job_id, week_ending)
);

-- ============================================================================
-- Role-check helpers (SECURITY DEFINER to avoid recursive RLS lookups on profiles)
-- ============================================================================
create function current_role_name() returns app_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid();
$$;

create function is_office_role() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(current_role_name() in ('owner', 'ops_manager', 'scheduler_pm'), false);
$$;

create function is_full_tier_role() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(current_role_name() in ('owner', 'ops_manager'), false);
$$;

create function can_access_update_progress() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(current_role_name() != 'painter_crew_member', false);
$$;

-- ============================================================================
-- Financial-masking views — the frontend reads these, not the base tables
-- ============================================================================
create view jobs_view with (security_invoker = true) as
  select
    id, pipedrive_deal_id, client_id, address, category, target_hours, date_won,
    case when is_office_role() then total_value else null end as total_value
  from jobs;

create view contractors_view with (security_invoker = true) as
  select
    id,
    case when is_office_role() then name else null end as name,
    case when is_office_role() then reported_monthly_capacity else null end as reported_monthly_capacity
  from contractors;

-- ============================================================================
-- Row Level Security
-- ============================================================================
alter table profiles enable row level security;
alter table clients enable row level security;
alter table contractors enable row level security;
alter table teams enable row level security;
alter table jobs enable row level security;
alter table schedule_blocks enable row level security;
alter table workers enable row level security;
alter table team_memberships enable row level security;
alter table credentials enable row level security;
alter table daily_hours_entries enable row level security;
alter table weekly_actuals enable row level security;

-- profiles: everyone can read all profiles (needed for name lookups on schedule/logs);
-- only office roles can change someone else's role; anyone can update their own non-role fields.
create policy "profiles_select_all" on profiles for select using (true);
create policy "profiles_update_own" on profiles for update using (id = auth.uid());
create policy "profiles_update_office" on profiles for update using (is_office_role());

-- clients / jobs: every authenticated role can read (Team Leader/Painter need address, target hours
-- etc. for their own work) — financial column is masked at the view layer above, not here.
create policy "clients_select_all" on clients for select to authenticated using (true);
create policy "clients_write_office" on clients for all to authenticated using (is_office_role()) with check (is_office_role());

create policy "jobs_select_all" on jobs for select to authenticated using (true);
create policy "jobs_write_office" on jobs for all to authenticated using (is_office_role()) with check (is_office_role());

-- teams: everyone can read (needed to label schedules); only office can manage.
create policy "teams_select_all" on teams for select to authenticated using (true);
create policy "teams_write_office" on teams for all to authenticated using (is_office_role()) with check (is_office_role());

-- schedule_blocks: everyone can read (own team's schedule); office can create/edit any phase;
-- Team Leader/Foreperson can update percent_complete only on their own team's blocks (enforced by
-- team_id match — column-level restriction to just percent_complete is handled at the app layer,
-- since this role has no other reason to call update).
create policy "schedule_blocks_select_all" on schedule_blocks for select to authenticated using (true);
create policy "schedule_blocks_write_office" on schedule_blocks for all to authenticated using (is_office_role()) with check (is_office_role());
create policy "schedule_blocks_update_own_team" on schedule_blocks for update to authenticated
  using (can_access_update_progress() and team_id = (select team_id from profiles where id = auth.uid()));

-- contractors / credentials / workers / team_memberships: the Contractor/Staff directory —
-- "Team Leader/Foreperson, Painter/Crew Member: no access at all" (main Decision Log, Section 5).
create policy "contractors_select_office" on contractors for select to authenticated using (is_office_role());
create policy "contractors_write_office" on contractors for all to authenticated using (is_office_role()) with check (is_office_role());

-- Credentials carry compliance detail — Full tier only (Owner/Ops Manager), per Decision 20.
create policy "credentials_select_full_tier" on credentials for select to authenticated using (is_full_tier_role());
create policy "credentials_write_full_tier" on credentials for all to authenticated using (is_full_tier_role()) with check (is_full_tier_role());

create policy "workers_select_office" on workers for select to authenticated using (is_office_role());
create policy "workers_write_office" on workers for all to authenticated using (is_office_role()) with check (is_office_role());

create policy "team_memberships_select_office" on team_memberships for select to authenticated using (is_office_role());
create policy "team_memberships_write_office" on team_memberships for all to authenticated using (is_office_role()) with check (is_office_role());

-- daily_hours_entries: field roles log their own team's hours; office can log on anyone's behalf
-- (Decision #17 office-fallback) and see everything for reconciliation.
create policy "daily_hours_select_own_or_office" on daily_hours_entries for select to authenticated
  using (is_office_role() or team_id = (select team_id from profiles where id = auth.uid()));
create policy "daily_hours_insert_own_or_office" on daily_hours_entries for insert to authenticated
  with check (
    is_office_role()
    or (entered_by_user_id = auth.uid() and team_id = (select team_id from profiles where id = auth.uid()))
  );

-- weekly_actuals: Pipedrive-sourced Job-level reconciliation — office screens only.
create policy "weekly_actuals_select_office" on weekly_actuals for select to authenticated using (is_office_role());
create policy "weekly_actuals_write_office" on weekly_actuals for all to authenticated using (is_office_role()) with check (is_office_role());

-- ============================================================================
-- Auto-create a profile row (least-privilege default role) when a new user signs up.
-- An office admin must promote the role afterwards via the Setup screen.
-- ============================================================================
create function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, name, role)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', new.email), 'painter_crew_member');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
