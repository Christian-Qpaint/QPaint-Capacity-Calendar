import { useMemo } from 'react'
import { useData } from '@/context/DataContext'
import type { DB } from '@/lib/dataAccess'
import * as da from '@/lib/dataAccess'

/** Binds the pure data-access helpers in src/lib/dataAccess.ts to live app state. */
export function useDataAccess() {
  const data = useData()

  const db: DB = useMemo(
    () => ({
      contractors: data.contractors,
      credentials: data.credentials,
      teams: data.teams,
      teamMemberships: data.teamMemberships,
      jobs: data.jobs,
      scheduleBlocks: data.scheduleBlocks,
      dailyHoursEntries: data.dailyHoursEntries,
    }),
    [data.contractors, data.credentials, data.teams, data.teamMemberships, data.jobs, data.scheduleBlocks, data.dailyHoursEntries],
  )

  return {
    db,
    teamScheduledInWindow: (teamId: string, start: Date, end: Date) => da.teamScheduledInWindow(db, teamId, start, end),
    getScheduledDollarsInWindow: (start: Date, end: Date) => da.getScheduledDollarsInWindow(db, start, end),
    getActualDollarsInWindow: (start: Date, end: Date) => da.getActualDollarsInWindow(db, start, end),
    getQPaintTeamRow: (team: (typeof data.teams)[number], start: Date, end: Date, isMonthly: boolean) =>
      da.getQPaintTeamRow(db, team, start, end, isMonthly),
    getContractorRow: (contractor: (typeof data.contractors)[number], start: Date, end: Date, isMonthly: boolean) =>
      da.getContractorRow(db, contractor, start, end, isMonthly),
    getMultiTeamShares: (block: (typeof data.scheduleBlocks)[number], job: (typeof data.jobs)[number]) =>
      da.getMultiTeamShares(db, block, job),
    getJobPhaseHoursTotal: (jobId: string) => da.getJobPhaseHoursTotal(db, jobId),
    getJobLoggedHours: (jobId: string) => da.getJobLoggedHours(db, jobId),
    getJobProgress: (job: (typeof data.jobs)[number]) => da.getJobProgress(db, job),
    getContractorAssignedJobTypes: (contractorId: string) => da.getContractorAssignedJobTypes(db, contractorId),
    getContractorCompliance: (contractorId: string, today?: Date) => da.getContractorCompliance(db, contractorId, today),
  }
}
