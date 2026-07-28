import { eq } from 'drizzle-orm'
import { getDb } from '../_shared/db.js'
import { requireOfficeRole, requireUser, isOfficeRole, canUpdateProgress, withErrorHandling, HttpError } from '../_shared/authz.js'
import { parseJsonBody } from '../_shared/http.js'
import { stripNulls } from '../_shared/rows.js'
import { scheduleBlocks } from '../../../db/schema.js'

function toValues(body: Record<string, unknown>) {
  return {
    jobId: body.jobId as string,
    teamId: body.teamId as string,
    workArea: body.workArea as 'External' | 'Internal' | 'Roof' | 'Epoxy Floors' | 'Decks',
    startDate: body.startDate as string,
    endDate: body.endDate as string,
    phaseHours: body.phaseHours as number,
    status: body.status as 'Unscheduled' | 'Scheduled' | 'In Production' | 'Overdue' | 'Completed',
    percentComplete: (body.percentComplete as number | undefined) ?? 0,
    percentCompleteUpdatedBy: (body.percentCompleteUpdatedBy as string | undefined) ?? null,
    percentCompleteUpdatedAt: (body.percentCompleteUpdatedAt as string | undefined) ?? null,
    notes: (body.notes as string | undefined) ?? null,
  }
}

export default withErrorHandling(async (req: Request) => {
  const db = getDb()
  const id = new URL(req.url).searchParams.get('id')

  if (req.method === 'POST') {
    await requireOfficeRole(req)
    const body = await parseJsonBody(req)
    const [created] = await db.insert(scheduleBlocks).values(toValues(body)).returning()
    return Response.json(stripNulls(created))
  }

  if (!id) throw new HttpError(400, 'Missing id')

  if (req.method === 'PATCH') {
    const user = await requireUser(req)
    const body = await parseJsonBody(req)

    if (isOfficeRole(user)) {
      const [updated] = await db.update(scheduleBlocks).set(toValues(body)).where(eq(scheduleBlocks.id, id)).returning()
      if (!updated) throw new HttpError(404, 'Schedule block not found')
      return Response.json(stripNulls(updated))
    }

    // Team Leader/Foreperson (and any non-office, non-crew role): can only progress-update their
    // own team's blocks — not create/delete, not any other field. Mirrors
    // schedule_blocks_update_own_team's RLS predicate plus the app-layer field restriction its
    // comment calls for.
    if (!canUpdateProgress(user)) throw new HttpError(403, 'Not allowed to update schedule blocks')
    const [current] = await db.select().from(scheduleBlocks).where(eq(scheduleBlocks.id, id)).limit(1)
    if (!current) throw new HttpError(404, 'Schedule block not found')
    if (current.teamId !== user.teamId) throw new HttpError(403, "Not your team's schedule block")

    const [updated] = await db
      .update(scheduleBlocks)
      .set({
        percentComplete: body.percentComplete as number,
        percentCompleteUpdatedBy: (body.percentCompleteUpdatedBy as string | undefined) ?? user.name,
        percentCompleteUpdatedAt: (body.percentCompleteUpdatedAt as string | undefined) ?? new Date().toISOString().slice(0, 10),
        status: (body.status as typeof current.status | undefined) ?? current.status,
      })
      .where(eq(scheduleBlocks.id, id))
      .returning()
    return Response.json(stripNulls(updated))
  }

  if (req.method === 'DELETE') {
    await requireOfficeRole(req)
    await db.delete(scheduleBlocks).where(eq(scheduleBlocks.id, id))
    return Response.json({ ok: true })
  }

  throw new HttpError(405, 'Method not allowed')
})

export const config = {
  path: '/api/schedule-blocks',
}
