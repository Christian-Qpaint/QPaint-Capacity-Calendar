// QPaint OS — Module 1 data model
// Mirrors the Developer Handoff Brief v1.2, Section 1.

export type Role =
  | 'owner'
  | 'ops_manager'
  | 'scheduler_pm'
  | 'team_leader_foreperson'
  | 'painter_crew_member'
  /** Marketing dashboard only — no access to Deals/Scheduler/Production/Settings by default. */
  | 'marketing'
  /** Deals CRM only — no access to Jobs/Scheduler/Production/Settings by default. */
  | 'admin'
  /** The Sales Availability page only — no access to anything else by default. */
  | 'sales'

export const ROLE_LABELS: Record<Role, string> = {
  owner: 'Owner / Management',
  ops_manager: 'Operations Manager',
  scheduler_pm: 'Scheduler / PM',
  team_leader_foreperson: 'Team Leader / Foreperson',
  painter_crew_member: 'Painter / Crew Member',
  marketing: 'Marketing',
  admin: 'Admin',
  sales: 'Sales',
}

export const OFFICE_ROLES: Role[] = ['owner', 'ops_manager', 'scheduler_pm']
export const FIELD_ROLES: Role[] = ['team_leader_foreperson', 'painter_crew_member']

export type ClientType = 'Individual' | 'Company' | 'Government' | 'Body Corporate'

export interface Client {
  id: string
  name: string
  type: ClientType
  contactInfo: string
  /** Synced one-way from the Pipedrive deal's linked Person (primary phone/email) — see
   * _shared/pipedriveApi.ts's extractPrimaryContact. Absent until a deal with a linked contact
   * has produced or updated this client. */
  phone?: string | null
  email?: string | null
}

export type JobCategory = 'Residential' | 'Government' | 'Corporate' | 'Commercial' | 'QPaint' | 'Work Projects' | 'Other'

export interface Job {
  id: string
  pipedriveDealId: string
  clientId: string
  address: string
  category: JobCategory
  totalValue: number // [financial]
  targetHours: number // [operational] — locked at deal acceptance
  dateWon: string // ISO date
  /** The deal's own title from Pipedrive, e.g. "41466 - 11 Dawson Street, Yeerongpilly (Genivieve Place CTS27991)" — already Quote-ID-prefixed in Pipedrive's own naming convention. */
  pipedriveDealTitle?: string
  /** The job's current stage — a real crm_stages row, same table the Deals board's Kanban columns
   * use. Points at a Jobs Pipeline stage for a job that lives on that board, or at a Sales/Business
   * Development stage for a job promoted from one of those pipelines (kept live by
   * syncJobStageDisplay as that deal keeps moving). Absent (stripped, like every other nullable
   * column here) until first assigned. */
  stageId?: string | null
  /** When the job last actually changed stage — CrmBoard-style auto-hide reads this the same way
   * crm_deals.stageEnteredAt does. Absent alongside stageId. */
  stageEnteredAt?: string | null
  /** Manual archive flag — hides the job from the Jobs List's default view but never from the
   * Capacity Calendar. Same column/semantics as CrmDeal.archivedAt (job-shaped deals). */
  archivedAt?: string | null
  /** Custom field values copied from the originating deal (Jobs Pipeline's own fields, or the
   * Sales/BizDev deal's fields at promotion time) — keyed by CrmFieldDefinition.key. Always present
   * at the DB level (defaults to `{}`), but omitted from the app-wide data-bootstrap list (it's
   * ~90 possible keys, several KB per job — real cost, no bootstrap-sourced page reads it) and
   * only actually populated by the single-job detail fetch (/api/jobs?id=, used by the CRM Deal
   * drawer for a Jobs-Pipeline-origin "deal"). Treat as absent unless you fetched that job
   * individually. */
  fields?: Record<string, unknown>
  /** Actual hours worked to date — sourced directly from Pipedrive's "Actual Hours to Date"
   * custom field (see FIELD_ACTUAL_HOURS in dealToJob.ts), never manually editable here. Absent
   * until Pipedrive has ever reported a value for this job's deal. */
  actualHours?: number | null
  /** Manual override for Production % — set only when productionPercentSource is 'manual'. When
   * 'computed', Production % is derived from each phase's Progress% weighted by that phase's $
   * value (see getJobProgress in dataAccess.ts). */
  productionPercentOverride?: number
  productionPercentSource: 'computed' | 'manual'
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

/** Manually-entered monthly ad spend by channel — v1 input for the Marketing module, until
 * Google Ads/Meta Ads APIs can feed this directly (same shape either way). */
export interface AdSpendEntry {
  id: string
  month: string // ISO date, always the 1st of the month, e.g. "2026-07-01"
  referralSource: string
  amount: number
}

/** One Sales or Jobs pipeline CRM deal (Lead/Quote/Won), read live from crm_deals — no separate
 * import step. isQuoted/isWon are derived server-side (marketing-data.mts) from the deal's actual
 * status and its "Date - Quote Sent" custom field, not inferred from rawStage, so the KPI math
 * never has to assume a particular pipeline's stage names/order. `status` is the raw open/won/lost
 * value, kept alongside isWon so the dashboard can offer a genuine Won/Lost filter (isWon alone
 * can't distinguish "still open" from "lost"). */
export interface MarketingDeal {
  id: string
  title: string | null
  referralSource: string
  rawStage: string | null
  status: 'open' | 'won' | 'lost'
  isQuoted: boolean
  isWon: boolean
  value: number
  createdDate: string // ISO date
  eventDate: string | null // ISO date — won date if won, else null
  /** Which table this record actually came from — 'sales' (crm_deals, Sales Pipeline) or
   * 'jobsPipeline' (jobs, Jobs Pipeline). Leads/Quotes are Sales-Pipeline-only (a Jobs Pipeline
   * record is already-won production, not a fresh lead); Jobs Won/Value are Jobs-Pipeline-only
   * (the real production record, not just a Sales deal's own status flag) — see
   * computeMarketingSummary. Without this split, a Sales deal promoted to a Job was counted twice:
   * once via its own crm_deals row, again via the job it produced. */
  source: 'sales' | 'jobsPipeline'
}

/** A local mirror of one Pipedrive pipeline (Sales/Jobs/Business Development, or a pipeline
 * created locally that never existed in Pipedrive) — configurable after seeding, diverges from
 * Pipedrive going forward. */
export interface CrmPipeline {
  id: string
  pipedrivePipelineId: number | null
  name: string
  order: number
}

/** One column within a CrmPipeline. isWonStage marks the stage(s) that, once a deal is dropped
 * into them (or the deal is explicitly marked Won), promote the deal into a real Job. */
export interface CrmStage {
  id: string
  pipelineId: string
  pipedriveStageId: number | null
  name: string
  order: number
  isWonStage: boolean
  color: string | null
  // "Rotting" thresholds in days — any/all nullable, see db/schema.ts's crmStages comment for the
  // fallback-to-default-7/14/21 rule CrmBoard.tsx applies when a stage sets none of these.
  rotYellowDays: number | null
  rotOrangeDays: number | null
  rotRedDays: number | null
  // Opts this stage out of rot coloring entirely — distinct from all-null thresholds above, which
  // instead falls back to the generic 7/14/21 default.
  rotDisabled: boolean
  // Once a deal's been sitting here longer than this, it's hidden from the board's default view.
  autoHideAfterDays: number | null
}

/** Configurable custom-field definition — seeded 1:1 from Pipedrive's own deal fields (same
 * opaque `key`), with more addable/editable locally afterward (key then prefixed `local_`). */
export interface CrmFieldDefinition {
  id: string
  key: string
  label: string
  fieldType: 'text' | 'number' | 'date' | 'boolean' | 'select' | 'multiselect' | 'address' | 'monetary'
  options: { id: string; label: string }[] | null
  order: number
}

/** A deal in the local CRM — either copied in automatically the moment it's created in
 * Pipedrive's Sales Pipeline, backfilled from Pipedrive's other pipelines at seed time, or added
 * here manually (pipedriveDealId null). Once it exists here it's managed locally; Pipedrive's own
 * later stage/field changes are never synced back in. */
export interface CrmDeal {
  id: string
  pipelineId: string
  stageId: string
  title: string
  value: number | null // null = masked for roles without crm.view_financials
  currency: string
  status: 'open' | 'won' | 'lost'
  pipedriveDealId: string | null
  orgName: string | null
  personName: string | null
  lostReason: string | null
  wonAt: string | null // ISO timestamp
  lostAt: string | null // ISO timestamp
  jobId: string | null // set once promoted to a real Job
  // True for a row on the Jobs Pipeline board — these are `jobs` rows shaped to look like a
  // CrmDeal (Jobs/Jobs-Pipeline merge), not a real crm_deals row. `id`/`jobId` are the same value
  // for these; several deal-only actions (mark won/lost, retry promotion, real delete) don't apply.
  isJob?: boolean
  // Manual archive flag, job-shaped rows only — hides from the Pipeline board's default view but
  // never from the Capacity Calendar. Undefined for real (non-job) deals.
  archivedAt?: string | null
  // When the deal last actually changed stage — not the same as updatedAt, which also moves on
  // plain field edits. CrmBoard.tsx measures "days sitting in this stage" against this.
  stageEnteredAt: string // ISO timestamp
  // Omitted (not just empty) on list/board rows from GET /api/crm-data — the ~65 possible custom
  // field keys made that payload the actual perf cost at scale, and board/table cards never
  // render them anyway. Only present once fetched individually via GET /api/crm-deals?id=.
  fields?: Record<string, unknown> // keyed by CrmFieldDefinition.key
  createdAt: string // ISO timestamp
  updatedAt: string // ISO timestamp
  // Same "only on single-deal fetch" convention as `fields` — one row per stint in a stage,
  // oldest first, `exitedAt` null for whichever stage the deal is currently in.
  stageHistory?: { stageId: string; stageName: string; enteredAt: string; exitedAt: string | null }[]
}

/** A one-time-imported copy of one of Pipedrive's own saved deal filters, selectable from a
 * dropdown on the Deals board — mirrors Pipedrive's own Filters list by name. The frontend never
 * sees the translated condition tree itself (only crm-data.mts needs it, to build the real SQL
 * predicate) — just enough to render the list and know which entries are actually runnable. */
export interface CrmSavedFilter {
  id: string
  pipedriveFilterId: number | null
  name: string
  order: number
  supported: boolean
  unsupportedReason: string | null
}

/** A single user's explicit grant/revoke for one PERMISSION_CATALOG key — absence of a row for a
 * given (userId, permissionKey) means "inherit that permission's role default" instead. */
export interface UserPermissionOverride {
  id: string
  userId: string
  permissionKey: string
  granted: boolean
  updatedAt: string
  updatedBy: string | null
}

/** A one-time invite link an owner generated — the only way a new account gets created now that
 * open self-signup is gone. `usedAt` null = still pending/redeemable. */
export interface UserInvite {
  id: string
  email: string
  role: Role
  token: string
  createdBy: string
  expiresAt: string
  usedAt: string | null
  createdAt: string
}

/** A persistent, per-recipient notification (distinct from sonner's transient action-result
 * toasts) — first use case is "request access", but type/link are generic for future kinds. */
export interface AppNotification {
  id: string
  recipientId: string
  type: string
  title: string
  body: string | null
  link: string | null
  read: boolean
  createdAt: string
  createdBy: string | null
}
