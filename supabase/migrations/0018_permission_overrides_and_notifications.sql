-- Per-user permission overrides — the missing layer on top of the existing role-only model. Every
-- gate in this app today is "role X can/can't do Y"; this lets the Owner grant or revoke an
-- individual permission for one specific user without changing their role (e.g. one salesperson
-- gets full Marketing access, another gets view-only with imports revoked, despite both being the
-- same role). Absence of a row for (user, permission_key) means "inherit the role default" — the
-- default itself lives in the app's PERMISSION_CATALOG (src/lib/permissionCatalog.ts), not here.
create table user_permission_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  permission_key text not null,
  granted boolean not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles (id),
  unique (user_id, permission_key)
);

alter table user_permission_overrides enable row level security;

-- A user can read their own overrides (needed client-side to compute their own effective
-- permissions without an owner-only round trip); only the Owner can read everyone's or write any.
create policy "permission_overrides_select" on user_permission_overrides
  for select using (user_id = auth.uid() or current_role_name() = 'owner');
create policy "permission_overrides_write" on user_permission_overrides
  for all using (current_role_name() = 'owner') with check (current_role_name() = 'owner');

-- Generic override lookup shared by every gating function below — returns null (not false) when
-- no override row exists, so callers can distinguish "explicitly denied" from "no opinion, fall
-- back to the role default" with a plain coalesce().
create function permission_override(check_user_id uuid, check_key text) returns boolean
language sql stable security definer set search_path = public as $$
  select granted from user_permission_overrides where user_id = check_user_id and permission_key = check_key;
$$;

-- Extends the existing role-only gate: an explicit per-user override now wins over the role
-- default, so e.g. a non-marketing/non-owner user can be granted view access, or a marketing user
-- can have it revoked, without touching their role.
create or replace function can_access_marketing() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(permission_override(auth.uid(), 'marketing.view'), current_role_name() in ('owner', 'marketing'), false);
$$;

-- New: a narrower permission than can_access_marketing() — lets "view only, no importing data"
-- be expressed as a real per-user override rather than just a UI-hidden button. Same role default
-- as can_access_marketing() (marketing access implies import access) unless overridden.
create function can_import_marketing_data() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(permission_override(auth.uid(), 'marketing.import'), current_role_name() in ('owner', 'marketing'), false);
$$;

-- Split the single "for all" marketing_deals/ad_spend policies into read vs. write, so
-- can_import_marketing_data() (not can_access_marketing()) is what actually gates writes.
drop policy "marketing_deals_all_marketing" on marketing_deals;
create policy "marketing_deals_select" on marketing_deals for select to authenticated using (can_access_marketing());
create policy "marketing_deals_insert" on marketing_deals for insert to authenticated with check (can_import_marketing_data());
create policy "marketing_deals_update" on marketing_deals for update to authenticated using (can_import_marketing_data()) with check (can_import_marketing_data());
create policy "marketing_deals_delete" on marketing_deals for delete to authenticated using (can_import_marketing_data());

drop policy "ad_spend_all_marketing" on ad_spend;
create policy "ad_spend_select" on ad_spend for select to authenticated using (can_access_marketing());
create policy "ad_spend_insert" on ad_spend for insert to authenticated with check (can_import_marketing_data());
create policy "ad_spend_update" on ad_spend for update to authenticated using (can_import_marketing_data()) with check (can_import_marketing_data());
create policy "ad_spend_delete" on ad_spend for delete to authenticated using (can_import_marketing_data());

-- Persistent, per-recipient notifications — distinct from sonner's transient action-result
-- toasts. First (only) use case today is "request access", but type/link are generic so future
-- notification kinds don't need a schema change.
create table notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references profiles (id) on delete cascade,
  type text not null default 'access_request',
  title text not null,
  body text,
  link text, -- app route to jump to, e.g. '/setup?tab=users&user=<id>'
  read boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references profiles (id)
);

create index notifications_recipient_idx on notifications (recipient_id, read, created_at desc);

alter table notifications enable row level security;

create policy "notifications_select_own" on notifications for select using (recipient_id = auth.uid());
create policy "notifications_update_own" on notifications for update using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());
-- Anyone signed in can create a notification for any recipient (that's how "request access"
-- reaches the Owner from a non-owner account) — created_by is pinned to the caller so the sender
-- can't be spoofed.
create policy "notifications_insert" on notifications for insert to authenticated with check (created_by = auth.uid());
