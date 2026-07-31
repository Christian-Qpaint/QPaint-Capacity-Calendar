// The catalog of every checkable permission in the app, grouped by page — this is the "checklist
// for every page, every function, every process" the Users & Permissions admin screen renders.
// Each entry's defaultForRole mirrors an existing predicate in permissions.ts, so a fresh user with
// no explicit overrides behaves exactly as the app did before this system existed. An override row
// in user_permission_overrides (keyed by `key`) replaces the default for that one user only —
// that's what lets two users with the same role diverge (e.g. one salesperson gets full Marketing
// access, another gets view-only with imports revoked).
//
// Scope note: every key here is enforced client-side (nav visibility, route guards, disabled
// buttons + "Request Access"). Only marketing.view/marketing.import are also enforced at the
// database (RLS) level today (see migration 0018) — the rest still rely on the existing role-based
// RLS underneath. Deepening DB-level enforcement for the others is a bigger, separate change (it
// means splitting the existing office-role RLS policies per table), not done here.

import { canAccessMarketing, canAccessUpdateProgress, canManageTargets, canSeeRawProductionRate, hasFinancialAccess, isOfficeRole } from './permissions'
import type { Role } from '@/types'

export interface PermissionDef {
  key: string
  page: string
  label: string
  description: string
  defaultForRole: (role: Role) => boolean
}

export const PERMISSION_PAGES = ['Deals', 'Jobs', 'Scheduler', 'Production', 'Marketing', 'Settings', 'Field'] as const

export const PERMISSION_CATALOG: PermissionDef[] = [
  // Jobs (view-only production tracking, at /jobs — job records themselves are now managed from
  // the Deals CRM; this page still owns schedule-block/phase CRUD, which is unrelated)
  { key: 'jobs.view', page: 'Jobs', label: 'View Jobs page', description: 'Open the Jobs list at all.', defaultForRole: isOfficeRole },
  { key: 'jobs.manage', page: 'Jobs', label: 'Schedule phases', description: 'Add, edit, or delete schedule phases from the Jobs page.', defaultForRole: isOfficeRole },
  { key: 'jobs.view_financials', page: 'Jobs', label: 'View job values ($)', description: 'See job dollar values rather than a masked/blank figure.', defaultForRole: hasFinancialAccess },

  // Deals (the CRM pipeline board, at /deals)
  { key: 'crm.view', page: 'Deals', label: 'View CRM pipeline board', description: 'Open the CRM Deals board (Sales/Jobs/Business Development pipelines) at all.', defaultForRole: isOfficeRole },
  { key: 'crm.manage', page: 'Deals', label: 'Add / edit / move CRM deals', description: 'Create deals, edit fields, drag between stages, mark Won/Lost, delete.', defaultForRole: isOfficeRole },
  { key: 'crm.view_financials', page: 'Deals', label: 'View CRM deal values ($)', description: 'See CRM deal dollar values rather than a masked/blank figure.', defaultForRole: hasFinancialAccess },
  { key: 'crm.manage_config', page: 'Deals', label: 'Manage pipelines, stages & fields', description: 'Rename/add/delete pipelines, stages, and custom field definitions.', defaultForRole: (role) => role === 'owner' },

  // Scheduler
  { key: 'scheduler.view', page: 'Scheduler', label: 'View Scheduler page', description: 'Open the Scheduler (calendar) at all.', defaultForRole: isOfficeRole },
  { key: 'scheduler.manage', page: 'Scheduler', label: 'Create / move / resize schedule blocks', description: 'Drag, drop, resize, or add phases on the calendar.', defaultForRole: isOfficeRole },

  // Production
  { key: 'production.view', page: 'Production', label: 'View Production page', description: 'Open the Production (Capacity Board) at all.', defaultForRole: isOfficeRole },
  { key: 'production.edit_progress', page: 'Production', label: 'Edit production % / actual hours', description: 'Override a job’s production percentage or actual hours.', defaultForRole: isOfficeRole },
  { key: 'production.manage_targets', page: 'Production', label: 'Manage monthly $ targets', description: 'Set or change the monthly revenue target used for capacity tiles.', defaultForRole: canManageTargets },
  { key: 'production.view_raw_rate', page: 'Production', label: 'View raw Production Rate ($/hr)', description: 'See the raw dollar-per-hour rate rather than the normalized Production Pace %.', defaultForRole: canSeeRawProductionRate },

  // Marketing
  { key: 'marketing.view', page: 'Marketing', label: 'View Marketing page', description: 'Open the Marketing dashboard at all.', defaultForRole: canAccessMarketing },
  // Historically gated the CSV/Pipedrive-import buttons (both removed now that Marketing reads
  // live from the Deals CRM) — kept because ad-spend.mts's server-side check is still keyed on
  // this exact permission string; only the label/description changed to stop describing a feature
  // that no longer exists. See ad-spend.mts + the "Ad Spend" button's own marketing.manage_ad_spend
  // gate for the pre-existing mismatch this key papers over.
  { key: 'marketing.import', page: 'Marketing', label: 'Manage Ad Spend (server-side)', description: 'Also enforced server-side for adding/editing/deleting Ad Spend entries.', defaultForRole: canAccessMarketing },
  { key: 'marketing.manage_ad_spend', page: 'Marketing', label: 'Manage Ad Spend', description: 'Add, edit, or delete monthly ad spend entries.', defaultForRole: canAccessMarketing },
  { key: 'marketing.export', page: 'Marketing', label: 'Print / export report', description: 'Use the Print / Export button to generate a report.', defaultForRole: canAccessMarketing },

  // Settings
  { key: 'settings.view', page: 'Settings', label: 'View Settings page', description: 'Open Settings (Teams / Contractors / Workers) at all.', defaultForRole: isOfficeRole },
  { key: 'settings.manage_teams', page: 'Settings', label: 'Manage QPaint Teams', description: 'Add or edit internal crew/team records.', defaultForRole: isOfficeRole },
  { key: 'settings.manage_contractors', page: 'Settings', label: 'Manage Contractors', description: 'Add or edit contractor company records.', defaultForRole: isOfficeRole },
  { key: 'settings.manage_workers', page: 'Settings', label: 'Manage Workers', description: 'Add or edit the worker/staff directory.', defaultForRole: isOfficeRole },
  { key: 'settings.manage_users', page: 'Settings', label: 'Manage Users & Permissions', description: 'Open this screen — view accounts and change permissions. Owner only by default.', defaultForRole: (role) => role === 'owner' },

  // Field
  { key: 'field.log_hours', page: 'Field', label: 'Log daily hours', description: 'Submit daily hours worked.', defaultForRole: () => true },
  { key: 'field.update_progress', page: 'Field', label: 'Update job progress', description: 'Submit on-site production/progress updates.', defaultForRole: canAccessUpdateProgress },
]

export function findPermission(key: string): PermissionDef | undefined {
  return PERMISSION_CATALOG.find((p) => p.key === key)
}
