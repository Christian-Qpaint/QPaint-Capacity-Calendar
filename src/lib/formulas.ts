// QPaint OS — Module 1 formulas
// Mirrors the Developer Handoff Brief v1.2, Section 2, one function per numbered formula.

import type { CapacityBand, ComplianceFlag, Credential, JobCategory } from '@/types'

const WEEKS_PER_MONTH = 4.33
const GLOBAL_SAFETY_MARGIN = 0.8

/** Formula 1 — Phase $ Value */
export function phaseValue(jobTotalValue: number, phaseHours: number, jobTargetHours: number): number {
  if (jobTargetHours <= 0) return 0
  return jobTotalValue * (phaseHours / jobTargetHours)
}

/** Formula 2 — Contractor Safety Target (0.80 is a global constant, not per-contractor) */
export function safetyTarget(reportedMonthlyCapacity: number): number {
  return reportedMonthlyCapacity * GLOBAL_SAFETY_MARGIN
}

/** Formula 3 — Capacity traffic-light bands. `usedPercent` is 0-100+ (e.g. 105 = 105%). Display only, never blocks. */
export function capacityBand(usedPercent: number): CapacityBand {
  if (usedPercent >= 115) return 'red'
  if (usedPercent >= 101) return 'orange'
  return 'green'
}

/** Formula 4 — Contractor under-utilization flag (default 60% threshold, adjustable) */
export function isContractorUnderUtilized(usedPercent: number, threshold = 60): boolean {
  return usedPercent < threshold
}

/** Formula 5 — QPaint Team under-utilization flag (tighter default threshold, adjustable 85-90%) */
export function isTeamUnderUtilized(usedPercent: number, threshold = 87.5): boolean {
  return usedPercent < threshold
}

/** Formula 6 — Monthly <-> Weekly derivation */
export function monthlyFromWeekly(weekly: number): number {
  return weekly * WEEKS_PER_MONTH
}
export function weeklyFromMonthly(monthly: number): number {
  return monthly / WEEKS_PER_MONTH
}
export function dailyFromMonthly(monthly: number): number {
  return monthly / (WEEKS_PER_MONTH * 7)
}

/** Formula 7 — Production Rate ($/hr), internal calculation only, never shown raw to field roles */
export function productionRate(
  phaseValueAmount: number,
  percentComplete: number,
  cumulativeDailyLoggedHours: number,
): number {
  if (cumulativeDailyLoggedHours <= 0) return 0
  return (phaseValueAmount * (percentComplete / 100)) / cumulativeDailyLoggedHours
}

/**
 * Formula 8 — Production Pace, the normalized (%) metric field roles are allowed to see.
 * Spec: pace = production_rate / (phase_value / job.target_hours)
 * Implemented literally per the locked Developer Handoff Brief formula (denominator uses the
 * Job's target_hours, not the individual phase's hours) — flagged in the Decision Log as a spec
 * point worth revisiting, not silently changed here.
 */
export function productionPace(
  productionRateAmount: number,
  phaseValueAmount: number,
  jobTargetHours: number,
): number {
  if (jobTargetHours <= 0) return 0
  const quotedRate = phaseValueAmount / jobTargetHours
  if (quotedRate <= 0) return 0
  return (productionRateAmount / quotedRate) * 100
}

/** Formula 9 — Multi-Team dollar split for a shared Schedule Block */
export function teamDollarShare(
  phaseValueAmount: number,
  teamHoursOnPhase: number,
  phaseTotalHoursWorked: number,
): number {
  if (phaseTotalHoursWorked <= 0) return 0
  return phaseValueAmount * (teamHoursOnPhase / phaseTotalHoursWorked)
}

/**
 * Formula 10 — Compliance Flag, derived per Contractor.
 * Evaluated only against credentials whose jobTypeScope matches one of the Contractor's
 * assigned job types, or is null/"All" (applies regardless).
 * Precedence: RED > GREY > AMBER > GREEN.
 */
export function complianceFlag(
  credentials: Credential[],
  assignedJobTypes: JobCategory[],
  today: Date = new Date(),
): ComplianceFlag {
  const relevant = credentials.filter(
    (c) => c.jobTypeScope === null || c.jobTypeScope === 'All' || assignedJobTypes.includes(c.jobTypeScope),
  )

  if (relevant.length === 0) return 'grey'

  const in30Days = new Date(today)
  in30Days.setDate(in30Days.getDate() + 30)

  let hasExpired = false
  let hasMissing = false
  let hasExpiringSoon = false

  for (const c of relevant) {
    if (!c.expiryDate) {
      hasMissing = true
      continue
    }
    const expiry = new Date(c.expiryDate)
    if (expiry < today) hasExpired = true
    else if (expiry < in30Days) hasExpiringSoon = true
  }

  if (hasExpired) return 'red'
  if (hasMissing) return 'grey'
  if (hasExpiringSoon) return 'amber'
  return 'green'
}

export function formatCurrency(value: number): string {
  return value.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 })
}

export function formatPercent(value: number): string {
  return `${Math.round(value)}%`
}
