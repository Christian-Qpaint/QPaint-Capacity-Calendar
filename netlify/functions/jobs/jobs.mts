import { eq } from 'drizzle-orm'
import { getDb } from '../_shared/db.js'
import { requireOfficeRole, withErrorHandling, HttpError } from '../_shared/authz.js'
import { parseJsonBody } from '../_shared/http.js'
import { stripNulls } from '../_shared/rows.js'
import { jobs } from '../../../db/schema.js'

function toValues(body: Record<string, unknown>) {
  return {
    clientId: body.clientId as string,
    address: body.address as string,
    category: body.category as 'Residential' | 'Government' | 'Corporate' | 'Commercial',
    totalValue: (body.totalValue as number | undefined) ?? 0,
    targetHours: body.targetHours as number,
    dateWon: body.dateWon as string,
    pipedriveStageId: (body.pipedriveStageId as number | undefined) ?? null,
    pipedriveDealTitle: (body.pipedriveDealTitle as string | undefined) ?? null,
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
    // Synthetic id — real deal ids are always numeric strings, so `MANUAL-` can never collide
    // with a real Pipedrive sync while still satisfying the not-null/unique column both rely on.
    const [created] = await db
      .insert(jobs)
      .values({
        ...toValues(body),
        pipedriveDealId: `MANUAL-${crypto.randomUUID()}`,
        actualHoursSource: 'computed',
        productionPercentSource: 'computed',
      })
      .returning()
    return Response.json(stripNulls(created))
  }

  if (!id) throw new HttpError(400, 'Missing id')

  if (req.method === 'PATCH' && action === 'actual-hours') {
    const body = await parseJsonBody(req)
    const override = body.override as number | null
    const [updated] = await db
      .update(jobs)
      .set(
        override === null
          ? { actualHoursOverride: null, actualHoursSource: 'computed' }
          : { actualHoursOverride: override, actualHoursSource: 'manual' },
      )
      .where(eq(jobs.id, id))
      .returning()
    if (!updated) throw new HttpError(404, 'Job not found')
    return Response.json(stripNulls(updated))
  }

  if (req.method === 'PATCH' && action === 'production') {
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

  if (req.method === 'PATCH') {
    const body = await parseJsonBody(req)
    const [updated] = await db.update(jobs).set(toValues(body)).where(eq(jobs.id, id)).returning()
    if (!updated) throw new HttpError(404, 'Job not found')
    return Response.json(stripNulls(updated))
  }

  if (req.method === 'DELETE') {
    // Cascades to schedule_blocks (and, through those, daily_hours_entries) via ON DELETE CASCADE.
    await db.delete(jobs).where(eq(jobs.id, id))
    return Response.json({ ok: true })
  }

  throw new HttpError(405, 'Method not allowed')
})

export const config = {
  path: '/api/jobs',
}
