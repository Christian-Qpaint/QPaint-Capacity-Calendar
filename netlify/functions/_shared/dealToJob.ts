// Shared Won-deal -> Job promotion logic — used by both the legacy pipedrive-webhook.mts (fires
// on any real Pipedrive deal event, checks status==='won' itself) and crm-deals.mts's local
// Won-stage/mark-won promotion. Both paths funnel through the SAME createOrAdoptJobFromDeal so a
// deal can never end up with two Jobs no matter which path reaches it first — it always checks
// jobs.pipedriveDealId before inserting and adopts (links, doesn't duplicate) if one exists.
import { asc, eq } from 'drizzle-orm'
import { getDb } from './db.js'
import { clients, jobs, crmPipelines, crmStages } from '../../../db/schema.js'
import { recordStageEntry } from './stageHistory.js'

// Pipedrive's real pipeline id for the Jobs Pipeline — every newly-created Job is placed directly
// onto this pipeline's first stage at creation time, since (post Jobs/Jobs-Pipeline merge) a job
// IS its Jobs Pipeline board card, not a separate linked row.
const JOBS_PIPELINE_PIPEDRIVE_ID = 3

// Pipedrive's own opaque field keys — real across the whole account, so both the raw webhook
// payload (pipedrive-webhook.mts) and our own crm_deals.fields blob (seeded 1:1 from these same
// keys) can be read with the exact same constants.
export const FIELD_TARGET_HOURS = 'ad1cfb10c0818b49d646c93cfcb44b8dfa31a911'
export const FIELD_CATEGORY = '27b0830b634b7730cc4cc6680db2ac2c7391ee77'
export const FIELD_ADDRESS = '38ad82cad541cf48ddfec84ba30f5f0fa521737e'
export const FIELD_ACTUAL_HOURS = '451734f86d063211334492cbfdc833b54ef9fde1'

type JobCategoryValue = 'Corporate' | 'Residential' | 'Government' | 'Commercial' | 'QPaint' | 'Work Projects' | 'Other'

export const CATEGORY_OPTION_MAP: Record<string, JobCategoryValue> = {
  '65': 'Corporate',
  '69': 'Residential',
  '70': 'QPaint',
  '71': 'Government',
  '73': 'Commercial',
  '1099': 'Work Projects',
  '1032': 'Other',
}

export interface DealForJobCreation {
  /** null for a deal that never existed in Pipedrive (added manually) — a synthetic
   * `MANUAL-<uuid>` is generated so the jobs table's not-null-unique column is still satisfied. */
  pipedriveDealId: string | null
  title: string | null
  orgName: string | null
  personName: string | null
  value: number
  /** null/undefined = not set yet — promotion is skipped, never guessed at, same refusal
   * behavior the original pipedrive-webhook.mts already had. */
  targetHours: number | null | undefined
  /** Pipedrive's "Actual Hours to Date" — unlike targetHours, absence never blocks promotion
   * (production just hasn't been logged there yet); null/undefined means not yet reported. */
  actualHours: number | null | undefined
  category: JobCategoryValue
  address: string
  dateWon: string
  /** The deal's linked Person's primary phone/email (see pipedriveApi.ts's extractPrimaryContact)
   * — carried onto the client record this job resolves to, null if no contact is linked yet. */
  personPhone: string | null
  personEmail: string | null
}

export type JobCreationResult = { status: 'created' | 'adopted'; jobId: string } | { status: 'skipped'; reason: string }

import { crmDeals } from '../../../db/schema.js'

export async function createOrAdoptJobFromDeal(db: ReturnType<typeof getDb>, input: DealForJobCreation): Promise<JobCreationResult> {
  if (input.targetHours === null || input.targetHours === undefined) {
    return { status: 'skipped', reason: 'No Target Hours custom field set on this deal yet' }
  }

  if (input.pipedriveDealId) {
    const [existingJob] = await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.pipedriveDealId, input.pipedriveDealId)).limit(1)
    if (existingJob) return { status: 'adopted', jobId: existingJob.id }
  }

  const clientName = input.orgName || input.personName || 'Unknown client'
  const [existingClient] = await db.select({ id: clients.id }).from(clients).where(eq(clients.name, clientName)).limit(1)
  let clientId = existingClient?.id
  if (!clientId) {
    const [newClient] = await db
      .insert(clients)
      .values({ name: clientName, type: input.orgName ? 'Company' : 'Individual', contactInfo: '', phone: input.personPhone, email: input.personEmail })
      .returning({ id: clients.id })
    clientId = newClient.id
  } else if (input.personPhone || input.personEmail) {
    // A repeat client (matched by name) — keep its contact details current too, not just on first
    // creation, since the same client can produce many jobs over time with an updated contact.
    await db.update(clients).set({ phone: input.personPhone, email: input.personEmail }).where(eq(clients.id, clientId))
  }

  // Place the new job directly onto the Jobs Pipeline's first stage — there's no separate Jobs
  // Pipeline deal row left to do this via anymore post-merge. Missing entirely only if the Jobs
  // Pipeline itself isn't mirrored locally yet (shouldn't happen in practice) — a job still gets
  // created either way, just without a stage until someone sets one manually.
  const [firstStage] = await db
    .select({ id: crmStages.id })
    .from(crmStages)
    .innerJoin(crmPipelines, eq(crmPipelines.id, crmStages.pipelineId))
    .where(eq(crmPipelines.pipedrivePipelineId, JOBS_PIPELINE_PIPEDRIVE_ID))
    .orderBy(asc(crmStages.order))
    .limit(1)

  const stageEnteredAt = new Date().toISOString()
  const [created] = await db
    .insert(jobs)
    .values({
      pipedriveDealId: input.pipedriveDealId ?? `MANUAL-${crypto.randomUUID()}`,
      clientId,
      address: input.address,
      category: input.category,
      totalValue: input.value,
      targetHours: input.targetHours,
      actualHours: input.actualHours ?? undefined,
      dateWon: input.dateWon,
      pipedriveDealTitle: input.title,
      stageId: firstStage?.id,
      stageEnteredAt: firstStage ? stageEnteredAt : undefined,
    })
    .returning({ id: jobs.id })

  // Opens the very first history stint — without this, a freshly promoted job's first stage (often
  // the longest-lived, "Admin") has zero history until its first move, breaking avg-dwell-time and
  // the age breakdown for exactly the stage that matters most.
  if (firstStage) await recordStageEntry(db, { jobId: created.id }, firstStage.id, stageEnteredAt)

  return { status: 'created', jobId: created.id }
}

/** Attempts to promote a CRM deal to a real Job — used when a deal is dragged into an isWonStage
 * stage, explicitly marked Won, or (via crm-deal-updated.mts) marked Won directly in Pipedrive
 * itself. A no-op (not an error) if the deal is already linked to a Job; routes through the same
 * createOrAdoptJobFromDeal every other promotion path uses, so none of them can ever double-create
 * a Job for one deal. Returns a reason (not an error/rejection) when promotion can't complete yet —
 * the stage move / Won status change itself always still succeeds. */
export async function attemptPromotion(
  db: ReturnType<typeof getDb>,
  deal: typeof crmDeals.$inferSelect,
): Promise<{ promoted: boolean; jobId: string | null; skippedReason?: string }> {
  if (deal.jobId) return { promoted: false, jobId: deal.jobId }

  const fields = deal.fields as Record<string, unknown>
  const rawTargetHours = fields[FIELD_TARGET_HOURS]
  const targetHours = typeof rawTargetHours === 'number' ? rawTargetHours : null
  const rawActualHours = fields[FIELD_ACTUAL_HOURS]
  const actualHours = typeof rawActualHours === 'number' ? rawActualHours : null
  const categoryOptionId = String(fields[FIELD_CATEGORY] ?? '')
  const address = (fields[FIELD_ADDRESS] as string | undefined) ?? ''

  const result = await createOrAdoptJobFromDeal(db, {
    pipedriveDealId: deal.pipedriveDealId,
    title: deal.title,
    orgName: deal.orgName,
    personName: deal.personName,
    value: deal.value,
    targetHours,
    actualHours,
    category: CATEGORY_OPTION_MAP[categoryOptionId] ?? 'Commercial',
    address,
    dateWon: (deal.wonAt ?? new Date().toISOString()).slice(0, 10),
    personPhone: deal.personPhone,
    personEmail: deal.personEmail,
  })

  if (result.status === 'skipped') return { promoted: false, jobId: null, skippedReason: result.reason }
  await db.update(crmDeals).set({ jobId: result.jobId }).where(eq(crmDeals.id, deal.id))
  return { promoted: result.status === 'created', jobId: result.jobId }
}

/** Keeps a Job's `stageId` (the Jobs page's read-only "Stage" pill) live as its linked CRM deal
 * keeps moving through its own pipeline (Sales/Business Development) after promotion — those
 * pipelines keep the deal row moving independently forever, unlike Jobs Pipeline where a job IS
 * its own board card now. Otherwise that column freezes at whatever stage the deal was in at the
 * moment it became a Job. Safe to call unconditionally: nothing in the Jobs page UI ever writes to
 * this field directly, so refreshing it here can never overwrite a user's own edit — there isn't
 * one to overwrite. Reuses the exact same `stageId` column Jobs-Pipeline-origin jobs use for their
 * own board position — harmless overlap, since a Sales/BizDev deal's stage id never collides with
 * a Jobs Pipeline stage id, so this never makes a job appear on the Jobs Pipeline Kanban. */
export async function syncJobStageDisplay(db: ReturnType<typeof getDb>, jobId: string, stageId: string | null): Promise<void> {
  if (stageId == null) return
  await db.update(jobs).set({ stageId }).where(eq(jobs.id, jobId))
}

/** Keeps a Job's title/value/category/address/targetHours/actualHours in step with its linked CRM
 * deal after promotion — same idea as syncJobStageDisplay, extended to every field a Job inherits
 * from its deal at creation time. Safe for the same reason: none of these fields have an edit UI
 * on the Jobs page (only productionPercentOverride does, and this never touches that), so there's
 * no manual edit to overwrite. Each field is only written when the deal actually has a usable
 * value — a blank/unmapped one is left alone rather than blanking out (or, for targetHours,
 * violating the not-null column with) whatever the Job already has. Also keeps the job's client
 * contact details (phone/email) current from the deal's linked Person. */
export async function syncJobFieldsFromDeal(
  db: ReturnType<typeof getDb>,
  jobId: string,
  deal: { title: string; value: number; fields: unknown; personPhone?: string | null; personEmail?: string | null },
): Promise<void> {
  const fields = (deal.fields ?? {}) as Record<string, unknown>
  const patch: Record<string, unknown> = {
    pipedriveDealTitle: deal.title,
    totalValue: deal.value,
  }

  const rawTargetHours = fields[FIELD_TARGET_HOURS]
  if (typeof rawTargetHours === 'number') patch.targetHours = rawTargetHours

  const rawActualHours = fields[FIELD_ACTUAL_HOURS]
  if (typeof rawActualHours === 'number') patch.actualHours = rawActualHours

  const mappedCategory = CATEGORY_OPTION_MAP[String(fields[FIELD_CATEGORY] ?? '')]
  if (mappedCategory) patch.category = mappedCategory

  const address = (fields[FIELD_ADDRESS] as string | undefined) || undefined
  if (address) patch.address = address

  const [updatedJob] = await db.update(jobs).set(patch).where(eq(jobs.id, jobId)).returning({ clientId: jobs.clientId })

  if (updatedJob && (deal.personPhone || deal.personEmail)) {
    await db.update(clients).set({ phone: deal.personPhone, email: deal.personEmail }).where(eq(clients.id, updatedJob.clientId))
  }
}
