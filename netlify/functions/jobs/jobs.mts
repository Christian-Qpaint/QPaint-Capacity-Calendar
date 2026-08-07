import { asc, eq, sql } from 'drizzle-orm'
import { getDb } from '../_shared/db.js'
import { requireOfficeRole, requireCrmAccess, canAccessCrm, withErrorHandling, HttpError } from '../_shared/authz.js'
import { parseJsonBody } from '../_shared/http.js'
import { stripNulls } from '../_shared/rows.js'
import { recordStageEntry } from '../_shared/stageHistory.js'
import { jobs, crmStages, crmDealStageHistory, crmFieldDefinitions, clients } from '../../../db/schema.js'

function toValues(body: Record<string, unknown>) {
  return {
    clientId: body.clientId as string,
    address: body.address as string,
    category: body.category as 'Residential' | 'Government' | 'Corporate' | 'Commercial',
    totalValue: (body.totalValue as number | undefined) ?? 0,
    targetHours: body.targetHours as number,
    dateWon: body.dateWon as string,
    pipedriveDealTitle: (body.pipedriveDealTitle as string | undefined) ?? null,
  }
}

async function fetchStageHistory(db: ReturnType<typeof getDb>, jobId: string) {
  return db
    .select({
      stageId: crmDealStageHistory.stageId,
      stageName: crmStages.name,
      enteredAt: crmDealStageHistory.enteredAt,
      exitedAt: crmDealStageHistory.exitedAt,
    })
    .from(crmDealStageHistory)
    .innerJoin(crmStages, eq(crmStages.id, crmDealStageHistory.stageId))
    .where(eq(crmDealStageHistory.jobId, jobId))
    .orderBy(asc(crmDealStageHistory.enteredAt))
}

// Reshapes a raw `jobs` row into a CrmDeal-compatible object (types/index.ts) — every
// Deals-board-facing response from this file (GET, stage move, archive/unarchive, field edit)
// returns this shape, not the raw job row, since the deal drawer/CrmBoard read `title`/`value`/
// `orgName`/`createdAt`/etc, none of which are jobs' own column names. Mirrors crm-data.mts's
// JOB_LIST_COLUMNS mapping for the board's list query — kept in sync manually since Drizzle
// doesn't share a single select-shape helper across functions. The Jobs page's own actions
// (actual-hours/production/generic edit/POST) deliberately keep returning the raw Job shape
// (src/types/index.ts's `Job`), unaffected by this.
async function shapeAsCrmDeal(db: ReturnType<typeof getDb>, jobId: string) {
  const [row] = await db
    .select({
      id: jobs.id,
      pipelineId: crmStages.pipelineId,
      stageId: jobs.stageId,
      title: jobs.pipedriveDealTitle,
      value: jobs.totalValue,
      currency: sql<string>`'AUD'`,
      status: sql<'won'>`'won'`,
      pipedriveDealId: jobs.pipedriveDealId,
      orgName: clients.name,
      personName: sql<string | null>`null`,
      lostReason: sql<string | null>`null`,
      wonAt: jobs.dateWon,
      lostAt: sql<string | null>`null`,
      jobId: jobs.id,
      stageEnteredAt: jobs.stageEnteredAt,
      createdAt: jobs.dateWon,
      updatedAt: jobs.dateWon,
      isJob: sql<boolean>`true`,
      archivedAt: jobs.archivedAt,
      fields: jobs.fields,
    })
    .from(jobs)
    .leftJoin(crmStages, eq(crmStages.id, jobs.stageId))
    .leftJoin(clients, eq(clients.id, jobs.clientId))
    .where(eq(jobs.id, jobId))
    .limit(1)
  return row
}

export default withErrorHandling(async (req: Request) => {
  const db = getDb()
  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  const action = url.searchParams.get('action')

  // GET/stage-move/archive are the Jobs-Pipeline-board-facing actions (CrmBoard.tsx, when the
  // active pipeline is Jobs Pipeline) — same access rule as the Deals board itself. Everything
  // else here (actual-hours/production overrides, manual add, generic field edit) is Jobs-page-
  // facing and stays office-only, matching this endpoint's original scope.
  if (req.method === 'GET') {
    const user = await requireCrmAccess(req)
    if (!id) throw new HttpError(400, 'Missing id')
    const row = await shapeAsCrmDeal(db, id)
    if (!row) throw new HttpError(404, 'Job not found')
    const stageHistory = await fetchStageHistory(db, id)
    if (canAccessCrm(user)) return Response.json({ ...stripNulls(row), stageHistory })

    const fieldDefs = await db.select().from(crmFieldDefinitions)
    const monetaryKeys = new Set(fieldDefs.filter((f) => f.fieldType === 'monetary').map((f) => f.key))
    const maskedFields = Object.fromEntries(
      Object.entries(row.fields as Record<string, unknown>).map(([k, v]) => [k, monetaryKeys.has(k) ? null : v]),
    )
    return Response.json({ ...stripNulls({ ...row, value: null, fields: maskedFields }), stageHistory })
  }

  if (req.method === 'POST') {
    await requireOfficeRole(req)
    const body = await parseJsonBody(req)
    // Synthetic id — real deal ids are always numeric strings, so `MANUAL-` can never collide
    // with a real Pipedrive sync while still satisfying the not-null/unique column both rely on.
    const [created] = await db
      .insert(jobs)
      .values({
        ...toValues(body),
        pipedriveDealId: `MANUAL-${crypto.randomUUID()}`,
        productionPercentSource: 'computed',
      })
      .returning()
    return Response.json(stripNulls(created))
  }

  if (!id) throw new HttpError(400, 'Missing id')

  if (req.method === 'PATCH' && action === 'stage') {
    await requireCrmAccess(req)
    const body = await parseJsonBody(req)
    const stageId = body.stageId as string
    const [targetStage] = await db.select().from(crmStages).where(eq(crmStages.id, stageId)).limit(1)
    if (!targetStage) throw new HttpError(404, 'Stage not found')

    const stageEnteredAtValue = new Date().toISOString()
    const [updatedRow] = await db
      .update(jobs)
      .set({ stageId, stageEnteredAt: stageEnteredAtValue })
      .where(eq(jobs.id, id))
      .returning({ id: jobs.id })
    if (!updatedRow) throw new HttpError(404, 'Job not found')
    await recordStageEntry(db, { jobId: updatedRow.id }, stageId, stageEnteredAtValue)
    const updated = await shapeAsCrmDeal(db, id)
    return Response.json(stripNulls(updated))
  }

  // No manual-edit path for Actual Hours — sourced directly from Pipedrive's "Actual Hours to
  // Date" field (see crm-job-updated.mts / _shared/dealToJob.ts) and never editable here.

  if (req.method === 'PATCH' && action === 'production') {
    await requireOfficeRole(req)
    const body = await parseJsonBody(req)
    const override = body.override as number | null
    const [updated] = await db
      .update(jobs)
      .set(
        override === null
          ? { productionPercentOverride: null, productionPercentSource: 'computed' }
          : { productionPercentOverride: override, productionPercentSource: 'manual' },
      )
      .where(eq(jobs.id, id))
      .returning()
    if (!updated) throw new HttpError(404, 'Job not found')
    return Response.json(stripNulls(updated))
  }

  // Jobs are never deleted — only archived (hidden from the Jobs Pipeline board's default view)
  // or unarchived. Archiving never affects the Capacity Calendar, which always shows every job
  // regardless of this flag; it only controls default visibility on the Pipeline/Jobs-list boards.
  if (req.method === 'PATCH' && action === 'archive') {
    await requireCrmAccess(req)
    const [row] = await db.update(jobs).set({ archivedAt: new Date().toISOString() }).where(eq(jobs.id, id)).returning({ id: jobs.id })
    if (!row) throw new HttpError(404, 'Job not found')
    return Response.json(stripNulls(await shapeAsCrmDeal(db, id)))
  }

  if (req.method === 'PATCH' && action === 'unarchive') {
    await requireCrmAccess(req)
    const [row] = await db.update(jobs).set({ archivedAt: null }).where(eq(jobs.id, id)).returning({ id: jobs.id })
    if (!row) throw new HttpError(404, 'Job not found')
    return Response.json(stripNulls(await shapeAsCrmDeal(db, id)))
  }

  // Job-shaped row edit from the Deals board's deal drawer — a narrow whitelist matching what
  // DealDrawer.tsx actually sends for a deal (title/value/fields), distinct from the Jobs page's
  // full-record edit below (which expects every field, not a partial patch).
  if (req.method === 'PATCH' && action === 'update-fields') {
    await requireCrmAccess(req)
    const body = await parseJsonBody(req)
    const patch: Record<string, unknown> = {}
    if (typeof body.title === 'string') patch.pipedriveDealTitle = body.title
    if (typeof body.value === 'number') patch.totalValue = body.value
    if (body.fields && typeof body.fields === 'object') {
      const [current] = await db.select({ fields: jobs.fields }).from(jobs).where(eq(jobs.id, id)).limit(1)
      patch.fields = { ...(current?.fields ?? {}), ...(body.fields as Record<string, unknown>) }
    }
    const [row] = await db.update(jobs).set(patch).where(eq(jobs.id, id)).returning({ id: jobs.id })
    if (!row) throw new HttpError(404, 'Job not found')
    return Response.json(stripNulls(await shapeAsCrmDeal(db, id)))
  }

  if (req.method === 'PATCH') {
    await requireOfficeRole(req)
    const body = await parseJsonBody(req)
    const [updated] = await db.update(jobs).set(toValues(body)).where(eq(jobs.id, id)).returning()
    if (!updated) throw new HttpError(404, 'Job not found')
    return Response.json(stripNulls(updated))
  }

  throw new HttpError(405, 'Method not allowed')
})

export const config = {
  path: '/api/jobs',
}
