// Port of get_production_pace() from supabase/migrations/0002_production_pace_rpc.sql. Callable
// by any authenticated role (Production Pace itself is safe to see) — the security boundary was
// never about who can call this, but about what the return value contains: it reads the job's raw
// total_value internally to compute the ratio, but only ever returns that ratio as a percentage,
// never the dollar figures themselves, so Team Leader/Painter roles (who jobs_view already masks
// total_value from) never see it even transiently through this path either.
import { eq, sql as sqlOp } from 'drizzle-orm'
import { getDb } from '../_shared/db.js'
import { requireUser, withErrorHandling, HttpError } from '../_shared/authz.js'
import { jobs, scheduleBlocks, dailyHoursEntries } from '../../../db/schema.js'

export default withErrorHandling(async (req: Request) => {
  await requireUser(req)
  const scheduleBlockId = new URL(req.url).searchParams.get('scheduleBlockId')
  if (!scheduleBlockId) throw new HttpError(400, 'Missing scheduleBlockId')

  const db = getDb()
  const [row] = await db
    .select({
      totalValue: jobs.totalValue,
      targetHours: jobs.targetHours,
      phaseHours: scheduleBlocks.phaseHours,
      percentComplete: scheduleBlocks.percentComplete,
    })
    .from(scheduleBlocks)
    .innerJoin(jobs, eq(jobs.id, scheduleBlocks.jobId))
    .where(eq(scheduleBlocks.id, scheduleBlockId))
    .limit(1)

  if (!row || !row.totalValue || !row.targetHours) return Response.json({ pace: null })

  const [{ cumulativeHours }] = await db
    .select({ cumulativeHours: sqlOp<number>`coalesce(sum(${dailyHoursEntries.hours}), 0)` })
    .from(dailyHoursEntries)
    .where(eq(dailyHoursEntries.scheduleBlockId, scheduleBlockId))

  if (!cumulativeHours) return Response.json({ pace: null })

  // Formula 1
  const phaseValue = row.totalValue * (row.phaseHours / row.targetHours)
  // Formula 7
  const productionRate = (phaseValue * (row.percentComplete / 100)) / cumulativeHours
  // Formula 8 (literal spec — denominator uses job.targetHours, not phaseHours)
  const quotedRate = phaseValue / row.targetHours

  if (!quotedRate) return Response.json({ pace: null })

  return Response.json({ pace: (productionRate / quotedRate) * 100 })
})

export const config = {
  path: '/api/production-pace',
}
