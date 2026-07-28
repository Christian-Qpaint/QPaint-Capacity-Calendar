import { getDb } from '../_shared/db.js'
import { requireUser, isOfficeRole, withErrorHandling, HttpError } from '../_shared/authz.js'
import { parseJsonBody } from '../_shared/http.js'
import { stripNulls } from '../_shared/rows.js'
import { dailyHoursEntries } from '../../../db/schema.js'

export default withErrorHandling(async (req: Request) => {
  if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed')
  const user = await requireUser(req)
  const body = await parseJsonBody(req)

  const teamId = body.teamId as string
  const enteredByUserId = body.enteredByUserId as string

  // Office can log on anyone's behalf (Decision #17 office-fallback); everyone else can only log
  // their own hours against their own team — mirrors daily_hours_insert_own_or_office's RLS check.
  if (!isOfficeRole(user)) {
    if (enteredByUserId !== user.id) throw new HttpError(403, 'Can only log your own hours')
    if (teamId !== user.teamId) throw new HttpError(403, "Not your team")
  }

  const db = getDb()
  const [created] = await db
    .insert(dailyHoursEntries)
    .values({
      scheduleBlockId: body.scheduleBlockId as string,
      teamId,
      enteredByUserId,
      date: body.date as string,
      hours: body.hours as number,
    })
    .returning()
  return Response.json(stripNulls(created))
})

export const config = {
  path: '/api/daily-hours-entries',
}
