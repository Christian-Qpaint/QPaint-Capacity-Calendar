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
])
export const clientTypeEnum = pgEnum('client_type', ['Individual', 'Company', 'Government', 'Body Corporate'])
export const jobCategoryEnum = pgEnum('job_category', ['Residential', 'Government', 'Corporate', 'Commercial'])
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
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
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
  reportedMonthlyCapacity: numeric('reported_monthly_capacity').notNull().default('0'),
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
    standardHoursPerWeek: numeric('standard_hours_per_week'),
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
  totalValue: numeric('total_value').notNull().default('0'),
  targetHours: numeric('target_hours').notNull(),
  dateWon: date('date_won').notNull(),
  pipedriveStageId: integer('pipedrive_stage_id'),
  pipedriveDealTitle: text('pipedrive_deal_title'),
  actualHoursOverride: numeric('actual_hours_override'),
  actualHoursSource: text('actual_hours_source').notNull().default('computed'),
  productionPercentOverride: numeric('production_percent_override'),
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
    phaseHours: numeric('phase_hours').notNull(),
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
  coverageAmount: numeric('coverage_amount'),
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
  hours: numeric('hours').notNull(),
}, (table) => [check('daily_hours_entries_hours_check', sql`${table.hours} > 0`)])

export const weeklyActuals = pgTable(
  'weekly_actuals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    weekEnding: date('week_ending').notNull(),
    actualHours: numeric('actual_hours').notNull(),
  },
  (table) => [unique('weekly_actuals_job_id_week_ending_key').on(table.jobId, table.weekEnding)],
)

export const monthlyTargets = pgTable(
  'monthly_targets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    year: integer('year').notNull(),
    month: integer('month').notNull(),
    targetDollars: numeric('target_dollars').notNull().default('0'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
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
    targetDollars: numeric('target_dollars').notNull(),
    actualDollars: numeric('actual_dollars').notNull(),
    capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
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
    amount: numeric('amount').notNull().default('0'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
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
    value: numeric('value').notNull().default('0'),
    createdDate: date('created_date').notNull(),
    eventDate: date('event_date'),
    importBatchId: uuid('import_batch_id').notNull(),
    importedAt: timestamp('imported_at', { withTimezone: true }).notNull().defaultNow(),
    pipeline: text('pipeline'),
    lostReason: text('lost_reason'),
    expectedCloseDate: date('expected_close_date'),
    importSource: text('import_source'),
  },
  (table) => [index('marketing_deals_import_batch_idx').on(table.importBatchId)],
)

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
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
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
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by').references(() => users.id),
}, (table) => [index('notifications_recipient_idx').on(table.recipientId, table.read, table.createdAt)])
