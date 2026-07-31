// Bootstrap read for the Marketing dashboard. `deals` used to come from a separately-imported
// marketing_deals table (CSV upload or a one-shot "Pull from Pipedrive" pull) — now it reads live
// from the Deals CRM's Sales + Jobs pipelines instead, matching Pipedrive's own combined lead/job
// count: Sales is kept continuously in sync by the two webhooks (crm-deal-created/crm-deal-updated),
// Jobs catches up via the board's manual "Sync" button. No import step, no stale snapshot: whatever
// is in crm_deals for those two pipelines right now is what Marketing reports on.
//
// `status` is passed through as-is (open/won/lost) so the dashboard can filter by it — Won deals
// stay counted here even though the CRM board hides them from its own default view once won (see
// crm-data.mts's `includeWon` handling); board visibility and marketing reporting are independent.
//
// Only two custom fields are pulled out of the `fields` jsonb blob (Referral Source, Date - Quote
// Sent), extracted via `->>` directly in the SELECT rather than loading the whole ~90-key blob per
// row — the same perf lesson crm-data.mts's list query already learned (see its header comment).
//
// `salesperson` is deliberately not part of this — Pipedrive's deal owner was never captured on
// crm_deals (only the "1st Quoter" custom field was, which per user decision isn't being mapped to
// it for now), so the Salesperson breakdown that existed in the old CSV-import-based Marketing view
// has been dropped rather than guessed at.
import { eq, inArray, sql } from 'drizzle-orm'
import { getDb } from '../_shared/db.js'
import { requireMarketingView, withErrorHandling } from '../_shared/authz.js'
import { stripNullsAll } from '../_shared/rows.js'
import { adSpend, crmDeals, crmStages, crmPipelines, crmFieldDefinitions } from '../../../db/schema.js'

const REFERRAL_SOURCE_KEY = 'e7f330cf1cbe354a1592472798c8709842330bee'
const QUOTE_SENT_DATE_KEY = 'bc9b4106c0b5d7ab4624092af14801d19fc58fba'
const SALES_PIPELINE_PIPEDRIVE_ID = 2
const JOBS_PIPELINE_PIPEDRIVE_ID = 3

export default withErrorHandling(async (req: Request) => {
  await requireMarketingView(req)
  const db = getDb()

  const [adSpendRows, reportedPipelines, fieldDefRows] = await Promise.all([
    db.select().from(adSpend).orderBy(adSpend.month),
    db.select().from(crmPipelines).where(inArray(crmPipelines.pipedrivePipelineId, [SALES_PIPELINE_PIPEDRIVE_ID, JOBS_PIPELINE_PIPEDRIVE_ID])),
    db.select().from(crmFieldDefinitions),
  ])

  let deals: {
    id: string
    title: string | null
    referralSource: string
    rawStage: string
    status: 'open' | 'won' | 'lost'
    isQuoted: boolean
    isWon: boolean
    value: number
    createdDate: string
    eventDate: string | null
  }[] = []
  const reportedPipelineIds = reportedPipelines.map((p) => p.id)
  if (reportedPipelineIds.length > 0) {
    const referralSourceDef = fieldDefRows.find((f) => f.key === REFERRAL_SOURCE_KEY)
    const referralOptionLabels = new Map((referralSourceDef?.options ?? []).map((o) => [o.id, o.label]))

    const rows = await db
      .select({
        id: crmDeals.id,
        title: crmDeals.title,
        value: crmDeals.value,
        status: crmDeals.status,
        createdAt: crmDeals.createdAt,
        wonAt: crmDeals.wonAt,
        stageName: crmStages.name,
        referralSourceRaw: sql<string | null>`(${crmDeals.fields} ->> ${REFERRAL_SOURCE_KEY})`,
        quoteSentDate: sql<string | null>`(${crmDeals.fields} ->> ${QUOTE_SENT_DATE_KEY})`,
      })
      .from(crmDeals)
      .innerJoin(crmStages, eq(crmStages.id, crmDeals.stageId))
      .where(inArray(crmDeals.pipelineId, reportedPipelineIds))

    deals = rows
      .map((d) => {
        const isWon = d.status === 'won'
        const createdDate = (d.createdAt ?? '').slice(0, 10)
        const wonDate = (d.wonAt ?? '').slice(0, 10)
        return {
          id: d.id,
          title: d.title,
          referralSource: (d.referralSourceRaw && referralOptionLabels.get(d.referralSourceRaw)) || 'Other',
          rawStage: d.stageName,
          status: d.status,
          isQuoted: isWon || !!d.quoteSentDate,
          isWon,
          value: d.value,
          createdDate,
          eventDate: isWon ? wonDate || createdDate || null : null,
        }
      })
      // Same rule the old CSV import used: no created date, can't place it on any date-scoped
      // chart/filter.
      .filter((d) => d.createdDate)
  }

  return Response.json({
    adSpend: stripNullsAll(adSpendRows),
    deals,
  })
})

export const config = {
  path: '/api/marketing-data',
}
