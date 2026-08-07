// Bootstrap read for the Marketing dashboard. `deals` used to come from a separately-imported
// marketing_deals table (CSV upload or a one-shot "Pull from Pipedrive" pull) — now it reads live
// from the Deals CRM's Sales + Jobs pipelines instead, matching Pipedrive's own combined lead/job
// count: Sales is kept continuously in sync by the two webhooks (crm-deal-created/crm-deal-updated).
// No import step, no stale snapshot: whatever is in crm_deals/jobs for those two pipelines right
// now is what Marketing reports on.
//
// Post Jobs/Jobs-Pipeline merge, a Jobs-Pipeline-origin record is a `jobs` row, not a `crm_deals`
// row (that migration deleted the old Jobs-Pipeline crm_deals rows entirely) — so this pulls from
// both tables and concatenates. A job promoted from *Sales* (not Jobs Pipeline) still has its own
// Sales-pipeline crm_deals row (status='won'), which the crm_deals branch below already counts —
// only jobs whose stageId actually sits on the Jobs Pipeline board are added from the jobs table,
// so a Sales-origin job is never double-counted.
//
// `status` is passed through as-is (open/won/lost) so the dashboard can filter by it — Won deals
// stay counted here even though the CRM board hides them from its own default view once won (see
// crm-data.mts's `includeWon` handling); board visibility and marketing reporting are independent.
// Every Jobs-Pipeline row is definitionally 'won' (a job only exists once Target Hours + promotion
// have happened), so it's hardcoded there rather than read from a status column jobs doesn't have.
//
// Only two custom fields are pulled out of the `fields` jsonb blob (Referral Source, Date - Quote
// Sent), extracted via `->>` directly in the SELECT rather than loading the whole ~90-key blob per
// row — the same perf lesson crm-data.mts's list query already learned (see its header comment).
// `jobs.fields` carries the exact same custom-field keys (copied across at promotion, kept live by
// crm-job-updated.mts), so the same two keys apply there unchanged.
//
// `salesperson` is deliberately not part of this — Pipedrive's deal owner was never captured on
// crm_deals (only the "1st Quoter" custom field was, which per user decision isn't being mapped to
// it for now), so the Salesperson breakdown that existed in the old CSV-import-based Marketing view
// has been dropped rather than guessed at.
import { eq, inArray, sql } from 'drizzle-orm'
import { getDb } from '../_shared/db.js'
import { requireMarketingView, withErrorHandling } from '../_shared/authz.js'
import { stripNullsAll } from '../_shared/rows.js'
import { adSpend, crmDeals, crmStages, crmPipelines, crmFieldDefinitions, jobs } from '../../../db/schema.js'

const REFERRAL_SOURCE_KEY = 'e7f330cf1cbe354a1592472798c8709842330bee'
const QUOTE_SENT_DATE_KEY = 'bc9b4106c0b5d7ab4624092af14801d19fc58fba'
const SALES_PIPELINE_PIPEDRIVE_ID = 2
const JOBS_PIPELINE_PIPEDRIVE_ID = 3

export default withErrorHandling(async (req: Request) => {
  await requireMarketingView(req)
  const db = getDb()

  const [adSpendRows, reportedPipelines, fieldDefRows, allStages] = await Promise.all([
    db.select().from(adSpend).orderBy(adSpend.month),
    db.select().from(crmPipelines).where(inArray(crmPipelines.pipedrivePipelineId, [SALES_PIPELINE_PIPEDRIVE_ID, JOBS_PIPELINE_PIPEDRIVE_ID])),
    db.select().from(crmFieldDefinitions),
    db.select().from(crmStages),
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

  // Jobs-Pipeline-origin records: no crm_deals row anymore (deleted at merge time), so pulled
  // straight from `jobs` — scoped to jobs actually sitting on the Jobs Pipeline board (stageId is
  // reused for Sales/BizDev-promoted jobs too, see dealToJob.ts's syncJobStageDisplay, so this
  // can't just be "every job").
  const jobsPipelineLocalId = reportedPipelines.find((p) => p.pipedrivePipelineId === JOBS_PIPELINE_PIPEDRIVE_ID)?.id
  const jobsPipelineStageIds = jobsPipelineLocalId ? allStages.filter((s) => s.pipelineId === jobsPipelineLocalId).map((s) => s.id) : []
  if (jobsPipelineStageIds.length > 0) {
    const jobRows = await db
      .select({
        id: jobs.id,
        title: jobs.pipedriveDealTitle,
        value: jobs.totalValue,
        dateWon: jobs.dateWon,
        stageName: crmStages.name,
        referralSourceRaw: sql<string | null>`(${jobs.fields} ->> ${REFERRAL_SOURCE_KEY})`,
      })
      .from(jobs)
      .innerJoin(crmStages, eq(crmStages.id, jobs.stageId))
      .where(inArray(jobs.stageId, jobsPipelineStageIds))

    const referralSourceDef = fieldDefRows.find((f) => f.key === REFERRAL_SOURCE_KEY)
    const referralOptionLabels = new Map((referralSourceDef?.options ?? []).map((o) => [o.id, o.label]))

    const jobDeals = jobRows
      .map((j) => {
        const createdDate = (j.dateWon ?? '').slice(0, 10)
        return {
          id: j.id,
          title: j.title,
          referralSource: (j.referralSourceRaw && referralOptionLabels.get(j.referralSourceRaw)) || 'Other',
          rawStage: j.stageName,
          status: 'won' as const,
          isQuoted: true,
          isWon: true,
          value: j.value,
          createdDate,
          eventDate: createdDate || null,
        }
      })
      .filter((d) => d.createdDate)

    deals = [...deals, ...jobDeals]
  }

  return Response.json({
    adSpend: stripNullsAll(adSpendRows),
    deals,
  })
})

export const config = {
  path: '/api/marketing-data',
}
