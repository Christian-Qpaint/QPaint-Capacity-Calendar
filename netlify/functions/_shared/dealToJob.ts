// Shared Won-deal -> Job promotion logic — used by both the legacy pipedrive-webhook.mts (fires
// on any real Pipedrive deal event, checks status==='won' itself) and crm-deals.mts's local
// Won-stage/mark-won promotion. Both paths funnel through the SAME createOrAdoptJobFromDeal so a
// deal can never end up with two Jobs no matter which path reaches it first — it always checks
// jobs.pipedriveDealId before inserting and adopts (links, doesn't duplicate) if one exists.
import { eq } from 'drizzle-orm'
import { getDb } from './db.js'
import { clients, jobs } from '../../../db/schema.js'

// Pipedrive's own opaque field keys — real across the whole account, so both the raw webhook
// payload (pipedrive-webhook.mts) and our own crm_deals.fields blob (seeded 1:1 from these same
// keys) can be read with the exact same constants.
export const FIELD_TARGET_HOURS = 'ad1cfb10c0818b49d646c93cfcb44b8dfa31a911'
export const FIELD_CATEGORY = '27b0830b634b7730cc4cc6680db2ac2c7391ee77'
export const FIELD_ADDRESS = '38ad82cad541cf48ddfec84ba30f5f0fa521737e'

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
  category: JobCategoryValue
  address: string
  dateWon: string
  pipedriveStageId: number | null
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
      .values({ name: clientName, type: input.orgName ? 'Company' : 'Individual', contactInfo: '' })
      .returning({ id: clients.id })
    clientId = newClient.id
  }

  const [created] = await db
    .insert(jobs)
    .values({
      pipedriveDealId: input.pipedriveDealId ?? `MANUAL-${crypto.randomUUID()}`,
      clientId,
      address: input.address,
      category: input.category,
      totalValue: input.value,
      targetHours: input.targetHours,
      dateWon: input.dateWon,
      pipedriveStageId: input.pipedriveStageId ?? undefined,
      pipedriveDealTitle: input.title,
    })
    .returning({ id: jobs.id })

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
  const categoryOptionId = String(fields[FIELD_CATEGORY] ?? '')
  const address = (fields[FIELD_ADDRESS] as string | undefined) ?? ''

  const result = await createOrAdoptJobFromDeal(db, {
    pipedriveDealId: deal.pipedriveDealId,
    title: deal.title,
    orgName: deal.orgName,
    personName: deal.personName,
    value: deal.value,
    targetHours,
    category: CATEGORY_OPTION_MAP[categoryOptionId] ?? 'Commercial',
    address,
    dateWon: (deal.wonAt ?? new Date().toISOString()).slice(0, 10),
    pipedriveStageId: null,
  })

  if (result.status === 'skipped') return { promoted: false, jobId: null, skippedReason: result.reason }
  await db.update(crmDeals).set({ jobId: result.jobId }).where(eq(crmDeals.id, deal.id))
  return { promoted: result.status === 'created', jobId: result.jobId }
}
