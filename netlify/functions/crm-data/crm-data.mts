// Bootstrap read for the CRM Deals board — mirrors marketing-data.mts's shape: a dedicated fetch
// rather than folded into data-bootstrap.mts, since crm_deals holds every stage of every pipeline
// (much larger, mostly page-irrelevant to Scheduler/Production/Field users) vs. jobs' curated
// won-only set.
import { asc } from 'drizzle-orm'
import { getDb } from '../_shared/db.js'
import { requireOfficeRole, isOfficeRole, withErrorHandling } from '../_shared/authz.js'
import { stripNullsAll } from '../_shared/rows.js'
import { crmPipelines, crmStages, crmFieldDefinitions, crmDeals } from '../../../db/schema.js'

export default withErrorHandling(async (req: Request) => {
  const user = await requireOfficeRole(req)
  const db = getDb()

  const [pipelineRows, stageRows, fieldDefinitionRows, dealRows] = await Promise.all([
    db.select().from(crmPipelines).orderBy(asc(crmPipelines.order)),
    db.select().from(crmStages).orderBy(asc(crmStages.order)),
    db.select().from(crmFieldDefinitions).orderBy(asc(crmFieldDefinitions.order)),
    db.select().from(crmDeals),
  ])

  // Same total_value masking convention as data-bootstrap.mts's jobs.totalValue: hide the real
  // number (not the row) for roles without financial access, matching crm.view_financials.
  const monetaryFieldKeys = new Set(fieldDefinitionRows.filter((f) => f.fieldType === 'monetary').map((f) => f.key))
  const financialAccess = isOfficeRole(user)
  const responseDeals = financialAccess
    ? stripNullsAll(dealRows)
    : stripNullsAll(dealRows).map((d) => ({
        ...d,
        value: null as unknown as number,
        fields: Object.fromEntries(Object.entries(d.fields as Record<string, unknown>).map(([k, v]) => [k, monetaryFieldKeys.has(k) ? null : v])),
      }))

  return Response.json({
    pipelines: stripNullsAll(pipelineRows),
    stages: stripNullsAll(stageRows),
    fieldDefinitions: stripNullsAll(fieldDefinitionRows),
    deals: responseDeals,
  })
})

export const config = {
  path: '/api/crm-data',
}
