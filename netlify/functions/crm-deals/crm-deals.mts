import { eq } from 'drizzle-orm'
import { getDb } from '../_shared/db.js'
import { requireOfficeRole, withErrorHandling, HttpError } from '../_shared/authz.js'
import { parseJsonBody } from '../_shared/http.js'
import { stripNulls } from '../_shared/rows.js'
import { crmDeals, crmStages } from '../../../db/schema.js'

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
  await requireOfficeRole(req)
  const db = getDb()
  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  const action = url.searchParams.get('action')

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

    // Plain stage move for now — Won->Job promotion (when targetStage.isWonStage) is wired up
    // once the shared createOrAdoptJobFromDeal helper lands (kept as a distinct addition so the
    // promotion behavior for both this action and the legacy Pipedrive webhook stays identical).
    const [updated] = await db
      .update(crmDeals)
      .set({ stageId, updatedAt: new Date().toISOString() })
      .where(eq(crmDeals.id, id))
      .returning()
    if (!updated) throw new HttpError(404, 'Deal not found')
    return Response.json({ ...stripNulls(updated), promoted: false })
  }

  if (req.method === 'PATCH' && action === 'mark-won') {
    // Same not-yet-wired caveat as the stage-move branch above.
    const [updated] = await db
      .update(crmDeals)
      .set({ status: 'won', wonAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
      .where(eq(crmDeals.id, id))
      .returning()
    if (!updated) throw new HttpError(404, 'Deal not found')
    return Response.json({ ...stripNulls(updated), promoted: false })
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
    if (body.fields && typeof body.fields === 'object') {
      const [current] = await db.select({ fields: crmDeals.fields }).from(crmDeals).where(eq(crmDeals.id, id)).limit(1)
      patch.fields = { ...(current?.fields ?? {}), ...(body.fields as Record<string, unknown>) }
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
