// The single "load everything" read on app mount — mirrors DataContext.tsx's old fetchAll, which
// fired 12 parallel Supabase queries and relied entirely on RLS to silently return empty/filtered
// results for tables a role can't see. Without RLS, that per-table visibility is reproduced here
// explicitly, straight from supabase/migrations/0001_init.sql's/0009's policies:
//   - clients, jobs, teams, schedule_blocks: every authenticated role
//   - contractors, credentials(full-tier only), workers, team_memberships, weekly_actuals,
//     monthly_targets, monthly_snapshots: office roles only (empty array otherwise)
//   - daily_hours_entries: office sees all, everyone else sees only their own team's entries
//   - jobs.totalValue: masked to null for non-office roles (jobs_view's case-when)
import { getDb } from '../_shared/db.js'
import { requireUser, isOfficeRole, isFullTierRole, withErrorHandling } from '../_shared/authz.js'
import { stripNullsAll } from '../_shared/rows.js'
import {
  clients,
  contractors,
  credentials,
  teams,
  workers,
  teamMemberships,
  jobs,
  scheduleBlocks,
  dailyHoursEntries,
  weeklyActuals,
  monthlyTargets,
  monthlySnapshots,
} from '../../../db/schema.js'
import { eq } from 'drizzle-orm'

export default withErrorHandling(async (req: Request) => {
  const user = await requireUser(req)
  const office = isOfficeRole(user)
  const fullTier = isFullTierRole(user)
  const db = getDb()

  const [
    clientRows,
    contractorRows,
    credentialRows,
    teamRows,
    workerRows,
    teamMembershipRows,
    jobRows,
    scheduleBlockRows,
    dailyHoursRows,
    weeklyActualRows,
    monthlyTargetRows,
    monthlySnapshotRows,
  ] = await Promise.all([
    db.select().from(clients),
    office ? db.select().from(contractors) : Promise.resolve([]),
    fullTier ? db.select().from(credentials) : Promise.resolve([]),
    db.select().from(teams),
    office ? db.select().from(workers) : Promise.resolve([]),
    office ? db.select().from(teamMemberships) : Promise.resolve([]),
    db.select().from(jobs),
    db.select().from(scheduleBlocks),
    office || !user.teamId
      ? db.select().from(dailyHoursEntries)
      : db.select().from(dailyHoursEntries).where(eq(dailyHoursEntries.teamId, user.teamId)),
    office ? db.select().from(weeklyActuals) : Promise.resolve([]),
    office ? db.select().from(monthlyTargets) : Promise.resolve([]),
    office ? db.select().from(monthlySnapshots) : Promise.resolve([]),
  ])

  // Strip real nulls first, then apply the total_value mask on top — masked jobs must keep an
  // explicit `null` (matching jobs_view's case-when for non-office roles), not have it stripped.
  const strippedJobs = stripNullsAll(jobRows)
  const responseJobs = office
    ? strippedJobs
    : strippedJobs.map((j) => ({ ...j, totalValue: null as unknown as number }))

  return Response.json({
    clients: stripNullsAll(clientRows),
    contractors: stripNullsAll(contractorRows),
    credentials: stripNullsAll(credentialRows),
    teams: stripNullsAll(teamRows),
    workers: stripNullsAll(workerRows),
    teamMemberships: stripNullsAll(teamMembershipRows),
    jobs: responseJobs,
    scheduleBlocks: stripNullsAll(scheduleBlockRows),
    dailyHoursEntries: stripNullsAll(dailyHoursRows),
    weeklyActuals: stripNullsAll(weeklyActualRows),
    monthlyTargets: stripNullsAll(monthlyTargetRows),
    monthlySnapshots: stripNullsAll(monthlySnapshotRows),
  })
})

export const config = {
  path: '/api/data',
}
