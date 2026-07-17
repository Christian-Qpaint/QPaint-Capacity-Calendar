// QPaint OS — derived-data computations shared by the office screens.
// Pure functions over explicit data (no hooks) so the math is easy to reason about independently
// of React — src/hooks/useDataAccess.ts binds these to live context state.

import type {
  Contractor,
  Credential,
  DailyHoursEntry,
  Job,
  JobCategory,
  ScheduleBlock,
  Team,
  TeamMembership,
} from '@/types'
import { capacityBand, complianceFlag, isContractorUnderUtilized, isTeamUnderUtilized, phaseValue, safetyTarget, weeklyFromMonthly } from './formulas'
import { hoursInWindow } from './schedule'

export interface DB {
  contractors: Contractor[]
  credentials: Credential[]
  teams: Team[]
  teamMemberships: TeamMembership[]
  jobs: Job[]
  scheduleBlocks: ScheduleBlock[]
  dailyHoursEntries: DailyHoursEntry[]
}

function jobRateFor(job: Job): number {
  return job.targetHours > 0 ? job.totalValue / job.targetHours : 0
}

function blockValue(block: ScheduleBlock, job: Job): number {
  return phaseValue(job.totalValue, block.phaseHours, job.targetHours)
}

/** Hours + $ scheduled for one Team within a window, across all its Schedule Blocks. */
export function teamScheduledInWindow(db: DB, teamId: string, windowStart: Date, windowEnd: Date) {
  let hours = 0
  let dollars = 0
  for (const block of db.scheduleBlocks) {
    if (block.teamId !== teamId) continue
    const job = db.jobs.find((j) => j.id === block.jobId)
    if (!job) continue
    const h = hoursInWindow(block, windowStart, windowEnd)
    if (h <= 0) continue
    hours += h
    const rate = block.phaseHours > 0 ? blockValue(block, job) / block.phaseHours : 0
    dollars += h * rate
  }
  return { hours, dollars }
}

/** Additive weekly capacity a Team gains from active Floating memberships in a window. */
function floatingCapacityBonus(db: DB, team: Team, windowStart: Date, windowEnd: Date): number {
  if (team.type !== 'QPaint' || !team.standardHoursPerWeek) return 0
  const activeFloating = db.teamMemberships.filter((m) => {
    if (m.teamId !== team.id || m.membershipType !== 'Floating') return false
    const start = new Date(m.startDate + 'T00:00:00')
    const end = m.endDate ? new Date(m.endDate + 'T00:00:00') : windowEnd
    return start <= windowEnd && end >= windowStart
  })
  return activeFloating.length * team.standardHoursPerWeek
}

export interface QPaintTeamCapacityRow {
  team: Team
  capacityHours: number
  scheduledHours: number
  scheduledDollars: number
  usedPercent: number
  band: ReturnType<typeof capacityBand>
  underUtilized: boolean
}

export function getQPaintTeamRow(
  db: DB,
  team: Team,
  windowStart: Date,
  windowEnd: Date,
  isMonthly: boolean,
): QPaintTeamCapacityRow {
  const baseWeekly = (team.headcount ?? 0) * (team.standardHoursPerWeek ?? 0)
  const weeklyCapacity = baseWeekly + floatingCapacityBonus(db, team, windowStart, windowEnd)
  const capacityHours = isMonthly ? weeklyCapacity * 4.33 : weeklyCapacity
  const { hours: scheduledHours, dollars: scheduledDollars } = teamScheduledInWindow(db, team.id, windowStart, windowEnd)
  const usedPercent = capacityHours > 0 ? (scheduledHours / capacityHours) * 100 : 0
  return {
    team,
    capacityHours,
    scheduledHours,
    scheduledDollars,
    usedPercent,
    band: capacityBand(usedPercent),
    underUtilized: !isMonthly && isTeamUnderUtilized(usedPercent),
  }
}

export interface ContractorCapacityRow {
  contractor: Contractor
  activeTeams: number
  targetDollars: number
  scheduledDollars: number
  usedPercent: number
  band: ReturnType<typeof capacityBand>
  underUtilized: boolean
}

export function getContractorRow(
  db: DB,
  contractor: Contractor,
  windowStart: Date,
  windowEnd: Date,
  isMonthly: boolean,
): ContractorCapacityRow {
  const monthlyTarget = safetyTarget(contractor.reportedMonthlyCapacity)
  const targetDollars = isMonthly ? monthlyTarget : weeklyFromMonthly(monthlyTarget)
  const contractorTeams = db.teams.filter((t) => t.contractorId === contractor.id)

  let scheduledDollars = 0
  let activeTeams = 0
  for (const team of contractorTeams) {
    const { hours, dollars } = teamScheduledInWindow(db, team.id, windowStart, windowEnd)
    if (hours > 0) activeTeams += 1
    scheduledDollars += dollars
  }
  const usedPercent = targetDollars > 0 ? (scheduledDollars / targetDollars) * 100 : 0
  return {
    contractor,
    activeTeams,
    targetDollars,
    scheduledDollars,
    usedPercent,
    band: capacityBand(usedPercent),
    underUtilized: isContractorUnderUtilized(usedPercent),
  }
}

export interface PhaseTeamShare {
  teamId: string
  teamName: string
  hoursOnPhase: number
  dollarShare: number
}

/** Formula 9 — dollar split when more than one Team logged hours against a shared Schedule Block. */
export function getMultiTeamShares(db: DB, block: ScheduleBlock, job: Job): PhaseTeamShare[] {
  const entries = db.dailyHoursEntries.filter((e) => e.scheduleBlockId === block.id)
  const byTeam = new Map<string, number>()
  for (const e of entries) {
    byTeam.set(e.teamId, (byTeam.get(e.teamId) ?? 0) + e.hours)
  }
  if (byTeam.size <= 1) return []

  const totalHoursWorked = Array.from(byTeam.values()).reduce((a, b) => a + b, 0)
  const value = blockValue(block, job)
  return Array.from(byTeam.entries()).map(([teamId, teamHours]) => {
    const team = db.teams.find((t) => t.id === teamId)
    return {
      teamId,
      teamName: team?.name ?? teamId,
      hoursOnPhase: teamHours,
      dollarShare: value > 0 ? value * (teamHours / totalHoursWorked) : 0,
    }
  })
}

export function getJobPhaseHoursTotal(db: DB, jobId: string): number {
  return db.scheduleBlocks.filter((b) => b.jobId === jobId).reduce((sum, b) => sum + b.phaseHours, 0)
}

/** Which job categories a Contractor is currently assigned to, for scoping Compliance Flag checks. */
export function getContractorAssignedJobTypes(db: DB, contractorId: string): JobCategory[] {
  const teamIds = new Set(db.teams.filter((t) => t.contractorId === contractorId).map((t) => t.id))
  const categories = new Set<JobCategory>()
  for (const block of db.scheduleBlocks) {
    if (!teamIds.has(block.teamId)) continue
    const job = db.jobs.find((j) => j.id === block.jobId)
    if (job) categories.add(job.category)
  }
  return Array.from(categories)
}

export function getContractorCompliance(db: DB, contractorId: string, today: Date = new Date()) {
  const assignedJobTypes = getContractorAssignedJobTypes(db, contractorId)
  const contractorCredentials = db.credentials.filter((c) => c.contractorId === contractorId)
  return {
    flag: complianceFlag(contractorCredentials, assignedJobTypes, today),
    credentials: contractorCredentials,
    assignedJobTypes,
  }
}

export { jobRateFor, blockValue }
