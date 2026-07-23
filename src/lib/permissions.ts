// QPaint OS — Module 1 role permission rules
// Mirrors the Developer Handoff Brief v1.2, Section 3.
//
// NOTE: this app has no backend yet (mock data only — see src/data/seed.ts). These predicates are
// called from a single data-access boundary (src/lib/dataAccess.ts) rather than scattered through
// components, so that when a real API exists, the same rules move server-side wholesale instead of
// being re-discovered. Per the locked spec: "Enforce all of the above at the query/API layer, not
// just UI hiding" — until there is a server, this module *is* that layer.

import type { Role } from '@/types'

export type ContractorDirectoryTier = 'full' | 'basic' | 'none'

/** Job total_value, phase_value, Contractor reported/safety $ figures. */
export function hasFinancialAccess(role: Role): boolean {
  return role === 'owner' || role === 'ops_manager' || role === 'scheduler_pm'
}

/** Raw Production Rate ($/hr) — everyone else sees the normalized Production Pace (%) instead. */
export function canSeeRawProductionRate(role: Role): boolean {
  return role === 'owner' || role === 'ops_manager'
}

export function contractorDirectoryTier(role: Role): ContractorDirectoryTier {
  if (role === 'owner' || role === 'ops_manager') return 'full'
  if (role === 'scheduler_pm') return 'basic'
  return 'none'
}

/** Update Progress: Foreperson-only for site entry, but office roles retain the same
 * office-fallback pattern as Daily Hours (Decision 27) — never Painter/Crew Member. */
export function canAccessUpdateProgress(role: Role): boolean {
  return role !== 'painter_crew_member'
}

export function isOfficeRole(role: Role): boolean {
  return role === 'owner' || role === 'ops_manager' || role === 'scheduler_pm'
}

export function isFieldRole(role: Role): boolean {
  return role === 'team_leader_foreperson' || role === 'painter_crew_member'
}

/** Ranking (1-5 star) is editable only by Ops Manager/Owner, read-only for Scheduler/PM. */
export function canEditRanking(role: Role): boolean {
  return role === 'owner' || role === 'ops_manager'
}

/** Monthly $ targets and end-of-month snapshots — Owner/Ops Manager only, same Full-tier gating
 * as Credentials and Ranking edits. Scheduler/PM can still view the Capacity Board and History. */
export function canManageTargets(role: Role): boolean {
  return role === 'owner' || role === 'ops_manager'
}

/** Marketing dashboard — a business-owner-facing analysis screen, not an operational one, so
 * it's its own gate rather than folded into isOfficeRole(). Owner already is this app's top/admin
 * tier, so "Owner or Marketing" covers both without a redundant separate Admin role. */
export function canAccessMarketing(role: Role): boolean {
  return role === 'owner' || role === 'marketing'
}
