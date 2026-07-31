import { eq } from 'drizzle-orm'
import { getDb } from '../_shared/db.js'
import { requireOfficeRole, isOfficeRole, withErrorHandling, HttpError } from '../_shared/authz.js'
import { parseJsonBody } from '../_shared/http.js'
import { stripNulls } from '../_shared/rows.js'
import { crmDeals, crmStages, crmFieldDefinitions } from '../../../db/schema.js'
import { attemptPromotion } from '../_shared/dealToJob.js'

function toValues(body: Record<string, unknown>) {
  return {
    pipelineId: body.pipelineId as string,
    stageId: body.stageId as string,
    title: body.title as string,
    value: (body.value as number | undefined) ?? 0,
    currency: (body.currency as string | undefined) ?? 'AUD',
    orgName: (body.orgName as string | undefined) ?? null,
    personName: (body.personName as string | undefined) ?? null,
  }
}

export default withErrorHandling(async (req: Request) => {
  const user = await requireOfficeRole(req)
  const db = getDb()
  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  const action = url.searchParams.get('action')

  if (req.method === 'GET') {
    if (!id) throw new HttpError(400, 'Missing id')
    const [deal] = await db.select().from(crmDeals).where(eq(crmDeals.id, id)).limit(1)
    if (!deal) throw new HttpError(404, 'Deal not found')
    if (isOfficeRole(user)) return Response.json(stripNulls(deal))

    // Same financial masking as crm-data.mts: hide the real value + any monetary custom field.
    const fieldDefs = await db.select().from(crmFieldDefinitions)
    const monetaryKeys = new Set(fieldDefs.filter((f) => f.fieldType === 'monetary').map((f) => f.key))
    const maskedFields = Object.fromEntries(
      Object.entries(deal.fields as Record<string, unknown>).map(([k, v]) => [k, monetaryKeys.has(k) ? null : v]),
    )
    return Response.json(stripNulls({ ...deal, value: null, fields: maskedFields }))
  }

  if (req.method === 'POST') {
    const body = await parseJsonBody(req)
    const [created] = await db.insert(crmDeals).values(toValues(body)).returning()
    return Response.json(stripNulls(created))
  }

  if (!id) throw new HttpError(400, 'Missing id')

  if (req.method === 'PATCH' && action === 'stage') {
    const body = await parseJsonBody(req)
    const stageId = body.stageId as string
    const [targetStage] = await db.select().from(crmStages).where(eq(crmStages.id, stageId)).limit(1)
    if (!targetStage) throw new HttpError(404, 'Stage not found')

    // Dragging into a Won-flagged stage is a status transition, not just a stage move.
    const patch: Record<string, unknown> = { stageId, stageEnteredAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    if (targetStage.isWonStage) {
      patch.status = 'won'
      patch.wonAt = new Date().toISOString()
    }
    const [updated] = await db.update(crmDeals).set(patch).where(eq(crmDeals.id, id)).returning()
    if (!updated) throw new HttpError(404, 'Deal not found')

    if (!targetStage.isWonStage) return Response.json({ ...stripNulls(updated), promoted: false })
    const { promoted, jobId, skippedReason } = await attemptPromotion(db, updated)
    return Response.json({ ...stripNulls({ ...updated, jobId: jobId ?? updated.jobId }), promoted, promotionSkippedReason: skippedReason })
  }

  if (req.method === 'PATCH' && action === 'mark-won') {
    const [updated] = await db
      .update(crmDeals)
      .set({ status: 'won', wonAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
      .where(eq(crmDeals.id, id))
      .returning()
    if (!updated) throw new HttpError(404, 'Deal not found')

    const { promoted, jobId, skippedReason } = await attemptPromotion(db, updated)
    return Response.json({ ...stripNulls({ ...updated, jobId: jobId ?? updated.jobId }), promoted, promotionSkippedReason: skippedReason })
  }

  if (req.method === 'PATCH' && action === 'mark-lost') {
    const body = await parseJsonBody(req)
    const [updated] = await db
      .update(crmDeals)
      .set({
        status: 'lost',
        lostAt: new Date().toISOString(),
        lostReason: (body.lostReason as string | undefined) ?? null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(crmDeals.id, id))
      .returning()
    if (!updated) throw new HttpError(404, 'Deal not found')
    return Response.json(stripNulls(updated))
  }

  if (req.method === 'PATCH') {
    const body = await parseJsonBody(req)
    const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() }
    for (const key of ['pipelineId', 'stageId', 'title', 'value', 'currency', 'orgName', 'personName', 'lostReason'] as const) {
      if (key in body) patch[key] = body[key]
    }
    const needsCurrent = 'stageId' in body || (body.fields && typeof body.fields === 'object')
    if (needsCurrent) {
      const [current] = await db.select({ fields: crmDeals.fields, stageId: crmDeals.stageId }).from(crmDeals).where(eq(crmDeals.id, id)).limit(1)
      if (body.fields && typeof body.fields === 'object') {
        patch.fields = { ...(current?.fields ?? {}), ...(body.fields as Record<string, unknown>) }
      }
      // Same "did the stage actually change" tracking as the dedicated action=stage endpoint above
      // — this generic PATCH also lets the deal drawer move a deal between stages directly.
      if ('stageId' in body && current && current.stageId !== body.stageId) patch.stageEnteredAt = new Date().toISOString()
    }
    const [updated] = await db.update(crmDeals).set(patch).where(eq(crmDeals.id, id)).returning()
    if (!updated) throw new HttpError(404, 'Deal not found')
    return Response.json(stripNulls(updated))
  }

  if (req.method === 'DELETE') {
    await db.delete(crmDeals).where(eq(crmDeals.id, id))
    return Response.json({ ok: true })
  }

  throw new HttpError(405, 'Method not allowed')
})

export const config = {
  path: '/api/crm-deals',
}
