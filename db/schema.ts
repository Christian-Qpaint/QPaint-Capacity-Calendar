// Drizzle schema — the structural (tables/columns/enums/constraints) translation of the app's
// former Supabase schema (supabase/migrations/0001..0018). Deliberately NOT ported here, since
// they depended on Supabase-specific machinery that no longer exists:
//   - Row Level Security policies and the auth.uid()-based role-check functions
//     (current_role_name/is_office_role/is_full_tier_role/can_access_marketing/etc.) — that
//     authorization logic now lives in netlify/functions' shared auth helpers instead.
//   - jobs_view / contractors_view (financial-masking views) — the same masking (null out
//     total_value / name / reported_monthly_capacity for non-office roles) now happens in the
//     Function that serves those rows, not in a Postgres view.
//   - get_production_pace() RPC — ported as a Function that runs the same formula in JS.
//   - profiles.id referencing auth.users, and the handle_new_user() trigger — there is no
//     separate Supabase Auth schema anymore, so `users` below IS the account table (email +
//     password hash), not just a profile extension of one.
//
// supabase/migrations/0005_import_contractors.sql was real seed DATA, not schema — it migrates
// across via pg_dump/pg_restore in the cutover phase, not as a Drizzle migration.

import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

// ============================================================================
// Enums
// ============================================================================
export const appRoleEnum = pgEnum('app_role', [
  'owner',
  'ops_manager',
  'scheduler_pm',
  'team_leader_foreperson',
  'painter_crew_member',
  'marketing',
  // Scoped, single-purpose roles — deliberately narrower than office roles: 'admin' only defaults
  // to Deals access, 'sales' only to the Sales Availability page. Neither is "office" in the
  // isOfficeRole sense (no Jobs/Scheduler/Production/Settings by default).
  'admin',
  'sales',
])
export const clientTypeEnum = pgEnum('client_type', ['Individual', 'Company', 'Government', 'Body Corporate'])
export const jobCategoryEnum = pgEnum('job_category', [
  'Residential',
  'Government',
  'Corporate',
  'Commercial',
  'QPaint',
  'Work Projects',
  'Other',
])
export const workAreaEnum = pgEnum('work_area', ['External', 'Internal', 'Roof', 'Epoxy Floors', 'Decks'])
export const scheduleBlockStatusEnum = pgEnum('schedule_block_status', [
  'Unscheduled',
  'Scheduled',
  'In Production',
  'Overdue',
  'Completed',
])
export const teamTypeEnum = pgEnum('team_type', ['QPaint', 'Contractor'])
export const workerTypeEnum = pgEnum('worker_type', ['Internal', 'Contractor'])
export const membershipTypeEnum = pgEnum('membership_type', ['Core', 'Floating'])
export const credentialTypeEnum = pgEnum('credential_type', [
  'Licence',
  'Insurance',
  'White Card',
  'Blue Card',
  'Police Check',
  'WHS Induction',
  'Driver Licence',
  'Other',
  'WorkCover',
  'Public Liability',
])
export const credentialJobTypeScopeEnum = pgEnum('credential_job_type_scope', [
  'All',
  'Residential',
  'Government',
  'Corporate',
  'Commercial',
])

// ============================================================================
// users — replaces Supabase's profiles + auth.users. Password auth is hand-rolled (bcrypt hash),
// verified/issued by the Netlify Functions in Phase 1.
// ============================================================================
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  role: appRoleEnum('role').notNull().default('painter_crew_member'),
  teamId: uuid('team_id').references(() => teams.id, { onDelete: 'set null' }),
  workerId: uuid('worker_id').references(() => workers.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
})

// Replaces open public self-signup: an owner generates a one-time link (email + intended role
// baked in) via user-invites.mts, hands it to the person directly (copy/paste — no email provider
// wired up), and accept-invite.mts is the only way a token turns into a real account. `usedAt` null
// means still pending/redeemable; `expiresAt` bounds how long a stale, unshared link stays valid.
export const userInvites = pgTable('user_invites', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull(),
  role: appRoleEnum('role').notNull(),
  token: text('token').notNull().unique(),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'string' }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true, mode: 'string' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
})

// ============================================================================
// Core tables
// ============================================================================
export const clients = pgTable('clients', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  type: clientTypeEnum('type').notNull(),
  contactInfo: text('contact_info').notNull().default(''),
})

export const contractors = pgTable('contractors', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  reportedMonthlyCapacity: numeric('reported_monthly_capacity', { mode: 'number' }).notNull().default(0),
  tradingName: text('trading_name'),
  abn: text('abn'),
  acn: text('acn'),
  gstRegistered: boolean('gst_registered'),
  licenceCategory: text('licence_category'),
  address: text('address'),
  suburb: text('suburb'),
  state: text('state'),
  postcode: text('postcode'),
  primaryContactName: text('primary_contact_name'),
  primaryContactMobile: text('primary_contact_mobile'),
  primaryContactEmail: text('primary_contact_email'),
  preferredArea: text('preferred_area'),
  afterHoursAvailable: text('after_hours_available'),
  ownEquipment: text('own_equipment'),
  ownTransport: text('own_transport'),
  yearsExperience: integer('years_experience'),
  reference1Name: text('reference_1_name'),
  reference1Phone: text('reference_1_phone'),
  reference2Name: text('reference_2_name'),
  reference2Phone: text('reference_2_phone'),
  approved: text('approved'),
  active: text('active'),
  lastUpdated: date('last_updated'),
  nickname: text('nickname'),
})

export const teams = pgTable(
  'teams',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    type: teamTypeEnum('type').notNull(),
    contractorId: uuid('contractor_id').references(() => contractors.id, { onDelete: 'cascade' }),
    headcount: integer('headcount'),
    standardHoursPerWeek: numeric('standard_hours_per_week', { mode: 'number' }),
    color: text('color'),
  },
  (table) => [
    check(
      'teams_contractor_shape',
      sql`(${table.type} = 'QPaint' and ${table.contractorId} is null) or (${table.type} = 'Contractor' and ${table.contractorId} is not null)`,
    ),
  ],
)

export const jobs = pgTable('jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  pipedriveDealId: text('pipedrive_deal_id').notNull().unique(),
  clientId: uuid('client_id')
    .notNull()
    .references(() => clients.id, { onDelete: 'restrict' }),
  address: text('address').notNull(),
  category: jobCategoryEnum('category').notNull(),
  totalValue: numeric('total_value', { mode: 'number' }).notNull().default(0),
  targetHours: numeric('target_hours', { mode: 'number' }).notNull(),
  dateWon: date('date_won').notNull(),
  pipedriveStageId: integer('pipedrive_stage_id'),
  pipedriveDealTitle: text('pipedrive_deal_title'),
  actualHoursOverride: numeric('actual_hours_override', { mode: 'number' }),
  actualHoursSource: text('actual_hours_source').notNull().default('computed'),
  productionPercentOverride: numeric('production_percent_override', { mode: 'number' }),
  productionPercentSource: text('production_percent_source').notNull().default('computed'),
}, (table) => [
  check('jobs_actual_hours_source_check', sql`${table.actualHoursSource} in ('computed', 'manual')`),
  check('jobs_production_percent_source_check', sql`${table.productionPercentSource} in ('computed', 'manual')`),
])

export const scheduleBlocks = pgTable(
  'schedule_blocks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    teamId: uuid('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'restrict' }),
    workArea: workAreaEnum('work_area').notNull(),
    startDate: date('start_date').notNull(),
    endDate: date('end_date').notNull(),
    phaseHours: numeric('phase_hours', { mode: 'number' }).notNull(),
    status: scheduleBlockStatusEnum('status').notNull().default('Scheduled'),
    percentComplete: integer('percent_complete').notNull().default(0),
    percentCompleteUpdatedBy: text('percent_complete_updated_by'),
    percentCompleteUpdatedAt: date('percent_complete_updated_at'),
    notes: text('notes'),
  },
  (table) => [
    check('schedule_blocks_percent_complete_check', sql`${table.percentComplete} between 0 and 100`),
    check('schedule_blocks_date_order', sql`${table.endDate} >= ${table.startDate}`),
  ],
)

export const workers = pgTable(
  'workers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    phone: text('phone').notNull().default(''),
    email: text('email').notNull().default(''),
    address: text('address').notNull().default(''),
    position: text('position').notNull().default(''),
    workerType: workerTypeEnum('worker_type').notNull(),
    contractorId: uuid('contractor_id').references(() => contractors.id, { onDelete: 'cascade' }),
    whiteCardNumber: text('white_card_number').notNull().default(''),
    qbuildInductionDone: boolean('qbuild_induction_done').notNull().default(false),
    qbuildInductionVerified: boolean('qbuild_induction_verified').notNull().default(false),
  },
  (table) => [
    check(
      'workers_contractor_shape',
      sql`(${table.workerType} = 'Internal' and ${table.contractorId} is null) or (${table.workerType} = 'Contractor' and ${table.contractorId} is not null)`,
    ),
  ],
)

export const teamMemberships = pgTable('team_memberships', {
  id: uuid('id').primaryKey().defaultRandom(),
  workerId: uuid('worker_id')
    .notNull()
    .references(() => workers.id, { onDelete: 'cascade' }),
  teamId: uuid('team_id')
    .notNull()
    .references(() => teams.id, { onDelete: 'cascade' }),
  startDate: date('start_date').notNull(),
  endDate: date('end_date'),
  membershipType: membershipTypeEnum('membership_type').notNull(),
})

export const credentials = pgTable('credentials', {
  id: uuid('id').primaryKey().defaultRandom(),
  contractorId: uuid('contractor_id')
    .notNull()
    .references(() => contractors.id, { onDelete: 'cascade' }),
  credentialType: credentialTypeEnum('credential_type').notNull(),
  number: text('number'),
  issuer: text('issuer'),
  coverageAmount: numeric('coverage_amount', { mode: 'number' }),
  expiryDate: date('expiry_date'),
  jobTypeScope: credentialJobTypeScopeEnum('job_type_scope'),
})

export const dailyHoursEntries = pgTable('daily_hours_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  scheduleBlockId: uuid('schedule_block_id')
    .notNull()
    .references(() => scheduleBlocks.id, { onDelete: 'cascade' }),
  teamId: uuid('team_id')
    .notNull()
    .references(() => teams.id, { onDelete: 'restrict' }),
  enteredByUserId: uuid('entered_by_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),
  date: date('date').notNull(),
  hours: numeric('hours', { mode: 'number' }).notNull(),
}, (table) => [check('daily_hours_entries_hours_check', sql`${table.hours} > 0`)])

export const weeklyActuals = pgTable(
  'weekly_actuals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    weekEnding: date('week_ending').notNull(),
    actualHours: numeric('actual_hours', { mode: 'number' }).notNull(),
  },
  (table) => [unique('weekly_actuals_job_id_week_ending_key').on(table.jobId, table.weekEnding)],
)

export const monthlyTargets = pgTable(
  'monthly_targets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    year: integer('year').notNull(),
    month: integer('month').notNull(),
    targetDollars: numeric('target_dollars', { mode: 'number' }).notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  },
  (table) => [
    unique('monthly_targets_year_month_key').on(table.year, table.month),
    check('monthly_targets_month_check', sql`${table.month} between 1 and 12`),
  ],
)

export const monthlySnapshots = pgTable(
  'monthly_snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    year: integer('year').notNull(),
    month: integer('month').notNull(),
    targetDollars: numeric('target_dollars', { mode: 'number' }).notNull(),
    actualDollars: numeric('actual_dollars', { mode: 'number' }).notNull(),
    capturedAt: timestamp('captured_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
    capturedBy: uuid('captured_by').references(() => users.id),
  },
  (table) => [
    unique('monthly_snapshots_year_month_key').on(table.year, table.month),
    check('monthly_snapshots_month_check', sql`${table.month} between 1 and 12`),
  ],
)

// ============================================================================
// Marketing module
// ============================================================================
export const adSpend = pgTable(
  'ad_spend',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    month: date('month').notNull(),
    referralSource: text('referral_source').notNull(),
    amount: numeric('amount', { mode: 'number' }).notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  },
  (table) => [unique('ad_spend_month_referral_source_key').on(table.month, table.referralSource)],
)

export const marketingDeals = pgTable(
  'marketing_deals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    externalId: text('external_id').unique(),
    title: text('title'),
    referralSource: text('referral_source').notNull().default('Other'),
    salesperson: text('salesperson'),
    rawStage: text('raw_stage'),
    isQuoted: boolean('is_quoted').notNull().default(false),
    isWon: boolean('is_won').notNull().default(false),
    value: numeric('value', { mode: 'number' }).notNull().default(0),
    createdDate: date('created_date').notNull(),
    eventDate: date('event_date'),
    importBatchId: uuid('import_batch_id').notNull(),
    importedAt: timestamp('imported_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
    pipeline: text('pipeline'),
    lostReason: text('lost_reason'),
    expectedCloseDate: date('expected_close_date'),
    importSource: text('import_source'),
  },
  (table) => [index('marketing_deals_import_batch_idx').on(table.importBatchId)],
)

// ============================================================================
// CRM — local mirror of Pipedrive's pipelines/stages/deals. Pipelines/stages/field
// definitions are SEEDED from Pipedrive (same ids/keys as source-of-truth) but diverge locally
// from then on — nothing here ever pushes back to Pipedrive. See
// netlify/functions/crm-deal-created for the one-way, creation-only Sales Pipeline automation.
// ============================================================================
export const crmDealStatusEnum = pgEnum('crm_deal_status', ['open', 'won', 'lost'])
export const crmFieldTypeEnum = pgEnum('crm_field_type', [
  'text',
  'number',
  'date',
  'boolean',
  'select',
  'multiselect',
  'address',
  'monetary',
])

export const crmPipelines = pgTable('crm_pipelines', {
  id: uuid('id').primaryKey().defaultRandom(),
  // Null for a pipeline created locally that never existed in Pipedrive.
  pipedrivePipelineId: integer('pipedrive_pipeline_id').unique(),
  name: text('name').notNull(),
  order: integer('order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
})

export const crmStages = pgTable('crm_stages', {
  id: uuid('id').primaryKey().defaultRandom(),
  pipelineId: uuid('pipeline_id')
    .notNull()
    .references(() => crmPipelines.id, { onDelete: 'cascade' }),
  pipedriveStageId: integer('pipedrive_stage_id').unique(),
  name: text('name').notNull(),
  order: integer('order').notNull().default(0),
  // Dragging a deal into (or explicitly marking Won while in) a stage with this set triggers
  // Won->Job promotion. Defaults false everywhere at seed time — not auto-derived from
  // "last stage in pipeline"; an office admin opts specific stages in deliberately.
  isWonStage: boolean('is_won_stage').notNull().default(false),
  color: text('color'),
  // "Rotting" thresholds (days sitting in this stage before the board tints a deal) — nullable per
  // tier so a stage can configure just one (e.g. Sales pipeline stages: red only, no yellow/orange)
  // or none at all, in which case the board falls back to a generic 7/14/21 default (see
  // CrmBoard.tsx's DEFAULT_ROT_THRESHOLDS). Deliberately per-stage rather than one global constant
  // — different stages rot at very different rates (a 3-day-old Lead Received deal is stale; a
  // 3-day-old Completed job isn't).
  rotYellowDays: integer('rot_yellow_days'),
  rotOrangeDays: integer('rot_orange_days'),
  rotRedDays: integer('rot_red_days'),
  // Once a deal has sat in this stage longer than this, it's hidden from the board's default view
  // (still counted everywhere else, never deleted) — e.g. Jobs Pipeline's "All Done & Paid" stage
  // auto-archives after 6 months so the board doesn't accumulate every job ever finished.
  autoHideAfterDays: integer('auto_hide_after_days'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
})

export const crmFieldDefinitions = pgTable('crm_field_definitions', {
  id: uuid('id').primaryKey().defaultRandom(),
  // Pipedrive's own opaque hash key for seeded fields; `local_<slug>` for fields added later.
  key: text('key').notNull().unique(),
  label: text('label').notNull(),
  fieldType: crmFieldTypeEnum('field_type').notNull(),
  options: jsonb('options').$type<{ id: string; label: string }[]>(),
  order: integer('order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
})

export const crmDeals = pgTable(
  'crm_deals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    pipelineId: uuid('pipeline_id')
      .notNull()
      .references(() => crmPipelines.id, { onDelete: 'restrict' }),
    stageId: uuid('stage_id')
      .notNull()
      .references(() => crmStages.id, { onDelete: 'restrict' }),
    title: text('title').notNull(),
    value: numeric('value', { mode: 'number' }).notNull().default(0),
    currency: text('currency').notNull().default('AUD'),
    status: crmDealStatusEnum('status').notNull().default('open'),
    // Null for a deal added manually here that never existed in Pipedrive. Postgres allows
    // multiple NULLs under a unique constraint, so no synthetic id is needed to satisfy this.
    pipedriveDealId: text('pipedrive_deal_id').unique(),
    orgName: text('org_name'),
    personName: text('person_name'),
    lostReason: text('lost_reason'),
    wonAt: timestamp('won_at', { withTimezone: true, mode: 'string' }),
    lostAt: timestamp('lost_at', { withTimezone: true, mode: 'string' }),
    jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'set null' }),
    // Custom field values keyed by crmFieldDefinitions.key — the ~65 Pipedrive fields that
    // aren't already real columns above (referral source, quoter, extent of work, etc.).
    fields: jsonb('fields').$type<Record<string, unknown>>().notNull().default({}),
    // Set whenever stageId actually changes (drag-and-drop, Pipedrive sync/webhook picking up a
    // stage move) — deliberately NOT the same as updatedAt, which also changes on plain field
    // edits/syncs that don't move the stage. This is what the board's staleness color-coding
    // (CrmBoard.tsx) measures "days sitting in this stage" against.
    stageEnteredAt: timestamp('stage_entered_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  },
  (table) => [
    index('crm_deals_pipeline_stage_idx').on(table.pipelineId, table.stageId),
    index('crm_deals_status_idx').on(table.status),
  ],
)

// One row per stint a deal spends in a stage — `exitedAt` null means "still there right now".
// Written by `_shared/stageHistory.ts`'s recordStageEntry, called from every place a deal's
// stageId changes (drag, drawer edit, both Pipedrive webhooks, the manual pipeline sync) and once
// on creation. Powers two things the deal_stage_entered_at column alone can't: the deal drawer's
// full stage-by-stage age breakdown (needs every past stint, not just the current one), and each
// stage's average dwell time (needs completed stints across every deal that's ever passed through).
// Deleting a stage config cascades here too — a stage's own history is meaningless once the stage
// itself no longer exists, and crm_deals.stage_id already blocks deleting a stage anything is
// CURRENTLY in, so this only ever prunes history for stages nothing references anymore.
export const crmDealStageHistory = pgTable(
  'crm_deal_stage_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    dealId: uuid('deal_id')
      .notNull()
      .references(() => crmDeals.id, { onDelete: 'cascade' }),
    stageId: uuid('stage_id')
      .notNull()
      .references(() => crmStages.id, { onDelete: 'cascade' }),
    enteredAt: timestamp('entered_at', { withTimezone: true, mode: 'string' }).notNull(),
    exitedAt: timestamp('exited_at', { withTimezone: true, mode: 'string' }),
  },
  (table) => [
    index('crm_deal_stage_history_deal_idx').on(table.dealId),
    index('crm_deal_stage_history_stage_idx').on(table.stageId),
  ],
)

// One-time-imported copies of Pipedrive's own saved deal filters (Filters > Deals in Pipedrive),
// selectable from a dropdown on the Deals board — same "copy from Pipedrive once, then a normal
// locally-editable row from then on" philosophy as pipelines/stages/field definitions. `conditions`
// is a translated nested AND/OR condition tree (see crmSavedFilterConditions.ts), evaluated
// entirely in SQL against crm_deals — NOT a live call back to Pipedrive. Not every Pipedrive filter
// is translatable this way: some reference things this app doesn't track at all (Pipedrive
// activities/orgs directly, deactivated-user ownership, "time in current stage"). Those import with
// `supported: false` and a human-readable `unsupportedReason` so the dropdown can show them
// disabled with an explanation instead of silently returning a wrong result set.
export const crmSavedFilters = pgTable('crm_saved_filters', {
  id: uuid('id').primaryKey().defaultRandom(),
  pipedriveFilterId: integer('pipedrive_filter_id').unique(),
  name: text('name').notNull(),
  order: integer('order').notNull().default(0),
  conditions: jsonb('conditions').notNull(),
  supported: boolean('supported').notNull().default(true),
  unsupportedReason: text('unsupported_reason'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
})

// ============================================================================
// Permissions & notifications
// ============================================================================
export const userPermissionOverrides = pgTable(
  'user_permission_overrides',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    permissionKey: text('permission_key').notNull(),
    granted: boolean('granted').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
    updatedBy: uuid('updated_by').references(() => users.id),
  },
  (table) => [uniqueIndex('user_permission_overrides_user_id_permission_key_key').on(table.userId, table.permissionKey)],
)

export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  recipientId: uuid('recipient_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  type: text('type').notNull().default('access_request'),
  title: text('title').notNull(),
  body: text('body'),
  link: text('link'),
  read: boolean('read').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  createdBy: uuid('created_by').references(() => users.id),
}, (table) => [index('notifications_recipient_idx').on(table.recipientId, table.read, table.createdAt)])
