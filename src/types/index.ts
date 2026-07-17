// QPaint OS — Module 1 data model
// Mirrors the Developer Handoff Brief v1.2, Section 1.

export type Role =
  | 'owner'
  | 'ops_manager'
  | 'scheduler_pm'
  | 'team_leader_foreperson'
  | 'painter_crew_member'

export const ROLE_LABELS: Record<Role, string> = {
  owner: 'Owner / Management',
  ops_manager: 'Operations Manager',
  scheduler_pm: 'Scheduler / PM',
  team_leader_foreperson: 'Team Leader / Foreperson',
  painter_crew_member: 'Painter / Crew Member',
}

export const OFFICE_ROLES: Role[] = ['owner', 'ops_manager', 'scheduler_pm']
export const FIELD_ROLES: Role[] = ['team_leader_foreperson', 'painter_crew_member']

export type ClientType = 'Individual' | 'Company' | 'Government' | 'Body Corporate'

export interface Client {
  id: string
  name: string
  type: ClientType
  contactInfo: string
}

export type JobCategory = 'Residential' | 'Government' | 'Corporate' | 'Commercial'

export interface Job {
  id: string
  pipedriveDealId: string
  clientId: string
  address: string
  category: JobCategory
  totalValue: number // [financial]
  targetHours: number // [operational] — locked at deal acceptance
  dateWon: string // ISO date
  /** Current Pipedrive Jobs Pipeline stage id — the Jobs List filters on this; null for jobs never synced from Pipedrive. */
  pipedriveStageId?: number
  /** The deal's own title from Pipedrive, e.g. "41466 - 11 Dawson Street, Yeerongpilly (Genivieve Place CTS27991)" — already Quote-ID-prefixed in Pipedrive's own naming convention. */
  pipedriveDealTitle?: string
  /** Manual override for Actual/Logged Hours — set only when actualHoursSource is 'manual'. When
   * 'computed', Actual Hours is the sum of real daily_hours_entries logged against this job's
   * schedule blocks (see getJobActualHours in dataAccess.ts). */
  actualHoursOverride?: number
  actualHoursSource: 'computed' | 'manual'
}

export type WorkArea = 'External' | 'Internal' | 'Roof' | 'Epoxy Floors' | 'Decks'
export type ScheduleBlockStatus =
  | 'Unscheduled'
  | 'Scheduled'
  | 'In Production'
  | 'Overdue'
  | 'Completed'

export interface ScheduleBlock {
  id: string
  jobId: string
  teamId: string // primary/scheduling Team
  workArea: WorkArea
  startDate: string // ISO date
  endDate: string // ISO date
  phaseHours: number // [operational]
  status: ScheduleBlockStatus
  percentComplete: number // 0-100, overwritten each update
  percentCompleteUpdatedBy?: string
  percentCompleteUpdatedAt?: string
  notes?: string
}

export type TeamType = 'QPaint' | 'Contractor'

export interface Team {
  id: string
  name: string
  type: TeamType
  contractorId?: string // null if type = QPaint
  headcount?: number // QPaint only — core/standing members
  standardHoursPerWeek?: number // QPaint only
  /** Hex color identity for the Resource Schedule Calendar, e.g. "#5DCAA5". Assignable from Setup
   * or directly on the Calendar; falls back to a deterministic default (see lib/teamColors.ts)
   * when unset. */
  color?: string
}

export type WorkerType = 'Internal' | 'Contractor'

export interface Worker {
  id: string
  firstName: string
  lastName: string
  phone: string
  email: string
  address: string
  position: string
  workerType: WorkerType
  contractorId?: string // null if workerType = Internal
  whiteCardNumber: string
  qbuildInductionDone: boolean
  qbuildInductionVerified: boolean
}

export type MembershipType = 'Core' | 'Floating'

export interface TeamMembership {
  id: string
  workerId: string
  teamId: string // QPaint teams only
  startDate: string
  endDate?: string // nullable — open-ended for Core
  membershipType: MembershipType
}

export interface Contractor {
  id: string
  name: string
  /** Short/friendly trading name shown in scheduling views (Calendar, Capacity Board, Assignment
   * Modal); reports/exports/contracts always use the legal `name` above. Falls back to `name` when unset. */
  nickname?: string
  reportedMonthlyCapacity: number // [financial]
  // Full-tier directory fields (Decision 20) — optional since Teams & Contractors Setup can create
  // a Contractor with just name + capacity; these fill in from a fuller import (e.g. the contractor
  // master spreadsheet) or manual entry later. Deliberately no banking (BSB/Account) fields — this
  // app has no legitimate need to hold bank account credentials.
  tradingName?: string
  abn?: string
  acn?: string
  gstRegistered?: boolean
  licenceCategory?: string
  address?: string
  suburb?: string
  state?: string
  postcode?: string
  primaryContactName?: string
  primaryContactMobile?: string
  primaryContactEmail?: string
  preferredArea?: string
  afterHoursAvailable?: string
  ownEquipment?: string
  ownTransport?: string
  yearsExperience?: number
  reference1Name?: string
  reference1Phone?: string
  reference2Name?: string
  reference2Phone?: string
  approved?: string
  active?: string
  lastUpdated?: string // ISO date
}

export type CredentialType =
  | 'Licence'
  | 'Insurance'
  | 'WorkCover'
  | 'Public Liability'
  | 'White Card'
  | 'Blue Card'
  | 'Police Check'
  | 'WHS Induction'
  | 'Driver Licence'
  | 'Other'

export type CredentialJobTypeScope = 'All' | JobCategory

export interface Credential {
  id: string
  contractorId: string
  credentialType: CredentialType
  number?: string
  issuer?: string
  expiryDate?: string // ISO date
  coverageAmount?: number
  jobTypeScope: CredentialJobTypeScope | null // null = applies regardless
}

export interface DailyHoursEntry {
  id: string
  scheduleBlockId: string
  teamId: string
  enteredByUserId: string
  date: string // ISO date
  hours: number
}

export interface WeeklyActual {
  id: string
  jobId: string
  weekEnding: string // ISO date
  actualHours: number
}

export interface User {
  id: string
  name: string
  role: Role
  teamId?: string // core/home Team, for Team Leaders/Painters
  workerId?: string
}

export type ComplianceFlag = 'red' | 'grey' | 'amber' | 'green'
export type CapacityBand = 'green' | 'orange' | 'red'

/** Manually-set $ target for one calendar month — replaces the old formula-derived Capacity
 * Board target tile so the business can account for seasonal swings. */
export interface MonthlyTarget {
  id: string
  year: number
  month: number // 1-12
  targetDollars: number
}

/** End-of-month "Actual vs Target" snapshot, captured manually so historical comparisons don't
 * shift if schedule data changes after the fact. */
export interface MonthlySnapshot {
  id: string
  year: number
  month: number // 1-12
  targetDollars: number
  actualDollars: number
  capturedAt: string // ISO timestamp
}
