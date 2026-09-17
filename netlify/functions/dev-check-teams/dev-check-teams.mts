// Temporary read-only diagnostic — checking current production `type`/`contractorId` for the
// teams named Ebi/Gary/Cornel before moving any of them into the Contractors section, since a
// stale local backup snapshot disagreed with what the user described. Deleted right after use.
// Gated the same way the real teams.mts endpoint is — this returns team/contractor names and ids,
// so it must not be reachable by anyone without an authenticated office session.
import { getDb } from '../_shared/db.js'
import { requireOfficeRole, withErrorHandling } from '../_shared/authz.js'
import { contractors, teams } from '../../../db/schema.js'

export default withErrorHandling(async (req: Request): Promise<Response> => {
  await requireOfficeRole(req)
  const db = getDb()
  const allTeams = await db.select().from(teams)
  const matches = allTeams.filter((t) => /ebi|gary|cornel|cornal/i.test(t.name))
  const allContractors = await db.select().from(contractors)
  return Response.json({
    matches,
    allTeamNames: allTeams.map((t) => ({ id: t.id, name: t.name, type: t.type, contractorId: t.contractorId })),
    allContractors: allContractors.map((c) => ({ id: c.id, name: c.name })),
  })
})

export const config = {
  path: '/api/dev-check-teams',
}
