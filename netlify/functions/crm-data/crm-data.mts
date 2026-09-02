// Bootstrap + paginated read for the CRM Deals board — mirrors marketing-data.mts's shape: a
// dedicated fetch rather than folded into data-bootstrap.mts, since crm_deals holds every stage of
// every pipeline (much larger, mostly page-irrelevant to Scheduler/Production/Field users) vs.
// jobs' curated won-only set.
//
// Deals are always fetched server-side paginated (?limit=/?offset=, default 50/0) rather than all
// at once — a real-data check found the Sales Pipeline alone holds 11k+ deals, and fetching that
// whole set (even with `fields` already excluded, see below) took seconds and rendered thousands
// of DOM rows/cards. The board lazy-loads pages as the user scrolls instead.
//
// Search (?search=, matched against title/orgName/personName), the advanced filter
// (?conditions=<JSON>&matchMode=), and sort (?sortKey=&sortDir=) are all evaluated in SQL, not in
// the browser, for the same reason: the frontend never holds the full result set to filter/sort
// over. ?stageId= additionally restricts to one stage, used by the Kanban view to lazy-load each
// column independently; ?stageSummary is computed over the same pipeline/search/filter scope but
// WITHOUT the stageId restriction, so every column's "N deals · $X" header stays accurate
// regardless of how many rows that column has actually loaded into the DOM.
//
// The list also omits the `fields` jsonb column entirely — real-world testing found this was the
// actual cost driver, not row count: with ~65 possible custom-field keys per deal, `fields` can
// run to several KB per row, and the board/table cards never render it (only the deal drawer
// does). `crm-deals.mts`'s GET ?id= fetches one deal's full record (fields included) on demand
// when a card/row is actually opened. Custom fields are also deliberately NOT filterable/sortable
// here for the same reason — see src/lib/crmDealFilters.ts's header comment.
import { asc, desc, eq, and, or, not, ilike, notInArray, inArray, isNotNull, isNull, lt, sql, type SQL, type AnyColumn } from 'drizzle-orm'
import { getDb } from '../_shared/db.js'
import { requireCrmAccess, canAccessCrm, withErrorHandling, HttpError } from '../_shared/authz.js'
import { stripNullsAll } from '../_shared/rows.js'
import {
  buildSavedFilterSql,
  savedFilterReferencesField,
  CRM_DEALS_SAVED_FILTER_TARGET,
  JOBS_SAVED_FILTER_TARGET,
  type SavedFilterNode,
  type SavedFilterLeaf,
  type SavedFilterTarget,
} from '../_shared/savedFilterSql.js'
import { crmPipelines, crmStages, crmFieldDefinitions, crmDeals, crmSavedFilters, crmDealStageHistory, jobs, clients } from '../../../db/schema.js'

// Jobs/Jobs-Pipeline merge: a job IS its Jobs Pipeline board card now — this pipeline's "deals"
// are read from `jobs` (shaped to look like a CrmDeal, see JOB_LIST_COLUMNS) instead of crm_deals.
// Sales Pipeline and Business Development are completely unaffected, still read from crm_deals
// exactly as before.
const JOBS_PIPELINE_PIPEDRIVE_ID = 3

// Once a Sales Pipeline deal is Won or Lost it's a closed deal — Won moves on to become a real Job
// (see crm-deal-updated.mts) and Pipedrive stops driving it, Lost is just dead weight on the
// working board — so both are hidden from the board's own default view, matching Pipedrive's own
// kanban (closed deals hidden unless you ask). Nothing is deleted or excluded from Marketing's own
// read (marketing-data.mts queries crm_deals directly, unaffected by this): `?includeWon=1` /
// `?includeLost=1` bring them back into this endpoint's results for anyone who explicitly wants to
// see them (or picks a filter that specifically targets them). Scoped to the Sales Pipeline only,
// matching the CRM's existing Won→Job promotion scope.
const SALES_PIPELINE_PIPEDRIVE_ID = 2

const DEAL_LIST_COLUMNS = {
  id: crmDeals.id,
  pipelineId: crmDeals.pipelineId,
  stageId: crmDeals.stageId,
  title: crmDeals.title,
  value: crmDeals.value,
  currency: crmDeals.currency,
  status: crmDeals.status,
  pipedriveDealId: crmDeals.pipedriveDealId,
  orgName: crmDeals.orgName,
  personName: crmDeals.personName,
  lostReason: crmDeals.lostReason,
  wonAt: crmDeals.wonAt,
  lostAt: crmDeals.lostAt,
  jobId: crmDeals.jobId,
  stageEnteredAt: crmDeals.stageEnteredAt,
  createdAt: crmDeals.createdAt,
  updatedAt: crmDeals.updatedAt,
}

// The Advanced Filter dialog builds its ad-hoc conditions in exactly the same shape saved filters
// already use (field/isCustom/operator/value) — see crmDealFilters.ts's header — so both run
// through the exact same buildSavedFilterSql engine instead of a second, parallel implementation.
// This is also what makes every real custom field filterable (not just Category/Referral Source,
// the only two previously hardcoded here): any crm_field_definitions key works automatically,
// typed correctly via CUSTOM_FIELD_NUMERIC_TYPES below so a number/date custom field compares
// numerically/chronologically instead of as text (a known limitation savedFilterSql.ts's own
// header used to call out — fixed alongside this).
function parseAdHocConditions(conditionsParam: string | null): SavedFilterLeaf[] {
  if (!conditionsParam) return []
  try {
    return JSON.parse(conditionsParam)
  } catch {
    return []
  }
}

function buildAdHocFilterSql(conditions: SavedFilterLeaf[], matchMode: string | null, target: SavedFilterTarget): SQL | undefined {
  if (conditions.length === 0) return undefined
  return buildSavedFilterSql({ glue: matchMode === 'OR' ? 'or' : 'and', conditions }, target)
}

// crm_field_definitions.field_type -> the cast savedFilterSql.ts's customFieldExpr should apply
// before a </<=/>/>= comparison, so e.g. Target Hours (a number field) sorts numerically instead
// of as text ("9" > "70" lexicographically, but not numerically). 'monetary' fields count as
// numbers too; everything else (text, boolean, select, multiselect, address) compares as plain
// text, which is already correct for eq/neq/contains/is_null/is_not_null regardless of cast.
function customFieldTypesFrom(fieldDefs: { key: string; fieldType: string }[]): Record<string, 'number' | 'date'> {
  const map: Record<string, 'number' | 'date'> = {}
  for (const f of fieldDefs) {
    if (f.fieldType === 'number' || f.fieldType === 'monetary') map[f.key] = 'number'
    else if (f.fieldType === 'date') map[f.key] = 'date'
  }
  return map
}

const SORTABLE_COLUMNS: Record<string, AnyColumn> = {
  title: crmDeals.title,
  orgName: crmDeals.orgName,
  personName: crmDeals.personName,
  value: crmDeals.value,
  status: crmDeals.status,
  createdAt: crmDeals.createdAt,
}

export default withErrorHandling(async (req: Request) => {
  const user = await requireCrmAccess(req)
  const db = getDb()
  const url = new URL(req.url)
  const pipelineId = url.searchParams.get('pipelineId')
  const stageId = url.searchParams.get('stageId')
  const search = url.searchParams.get('search')?.trim() ?? ''
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 50, 1), 200)
  const offset = Math.max(Number(url.searchParams.get('offset')) || 0, 0)
  const sortKey = url.searchParams.get('sortKey')
  const sortDir = url.searchParams.get('sortDir') === 'desc' ? 'desc' : 'asc'
  const conditionsParam = url.searchParams.get('conditions')
  const matchMode = url.searchParams.get('matchMode')
  const savedFilterId = url.searchParams.get('savedFilterId')
  const includeWon = url.searchParams.get('includeWon') === '1'
  const includeLost = url.searchParams.get('includeLost') === '1'
  const includeAged = url.searchParams.get('includeAged') === '1'
  // The Kanban board fires one request per stage column on load (each lazily paging its own
  // dealRows) — summaryRows/avgDwellRows below are pipeline-wide aggregates, identical no matter
  // which stageId the request is for, so computing them on every column's request redundantly ran
  // the same expensive GROUP BY / stage-history AVG(epoch) query N times concurrently (confirmed as
  // the real cause of a slow Kanban page load, not card-rendering volume — the board already
  // lazy-loads 50 rows per column). The frontend now only asks for them once per pipeline/filter
  // change (?includeSummary=1) and reuses that single response for every column, keyed by stageId.
  const includeSummary = !stageId || url.searchParams.get('includeSummary') === '1'

  const [pipelineRows, stageRows, fieldDefinitionRows, savedFilterRows] = await Promise.all([
    db.select().from(crmPipelines).orderBy(asc(crmPipelines.order)),
    db.select().from(crmStages).orderBy(asc(crmStages.order)),
    // Always fetched now (previously skipped for a per-pipeline request as a pointless re-fetch —
    // see the comment that used to be here) since the Advanced Filter's ad-hoc conditions need to
    // resolve a custom field's real type (customFieldTypesFrom below) on every filtered request,
    // not just the initial bootstrap call. Still a small, cheap table (~96 rows, no jsonb blob).
    db.select().from(crmFieldDefinitions).orderBy(asc(crmFieldDefinitions.order)),
    pipelineId
      ? Promise.resolve([])
      : db
          .select({
            id: crmSavedFilters.id,
            pipedriveFilterId: crmSavedFilters.pipedriveFilterId,
            name: crmSavedFilters.name,
            order: crmSavedFilters.order,
            supported: crmSavedFilters.supported,
            unsupportedReason: crmSavedFilters.unsupportedReason,
          })
          .from(crmSavedFilters)
          .orderBy(asc(crmSavedFilters.order)),
  ])

  const rawConditions = parseAdHocConditions(conditionsParam)
  // If whatever's already selected (ad-hoc condition or saved filter) has its own opinion about
  // `status` — e.g. Pipedrive's real "All lost deals" filter — the hard default exclusion below
  // backs off instead of AND-ing against it and silently returning zero rows.
  const adHocReferencesStatus = rawConditions.some((c) => !c.isCustom && c.field === 'status')
  const customFieldTypes = customFieldTypesFrom(fieldDefinitionRows)

  // Compiled to SQL per-branch below (buildSavedFilterSql(savedFilterTree, target)), not once here —
  // the same condition tree needs different real columns depending on whether the active pipeline
  // reads from crm_deals or jobs (see savedFilterSql.ts's two SavedFilterTarget constants).
  let savedFilterTree: SavedFilterNode | undefined
  let savedFilterReferencesStatus = false
  if (savedFilterId) {
    const [savedFilter] = await db.select().from(crmSavedFilters).where(eq(crmSavedFilters.id, savedFilterId)).limit(1)
    if (!savedFilter) throw new HttpError(404, 'Saved filter not found')
    if (!savedFilter.supported) throw new HttpError(400, `This filter can't run here — ${savedFilter.unsupportedReason ?? 'unsupported'}`)
    savedFilterTree = savedFilter.conditions as SavedFilterNode
    savedFilterReferencesStatus = savedFilterReferencesField(savedFilterTree, 'status')
  }

  interface BoardDealRow {
    id: string
    pipelineId: string
    stageId: string | null
    title: string
    value: number | null
    currency: string
    status: 'open' | 'won' | 'lost'
    pipedriveDealId: string | null
    orgName: string | null
    personName: string | null
    lostReason: string | null
    wonAt: string | null
    lostAt: string | null
    jobId: string | null
    stageEnteredAt: string | null
    createdAt: string | null
    updatedAt: string | null
    isJob?: boolean
    archivedAt?: string | null
  }
  let deals: BoardDealRow[] = []
  let total = 0
  let stageSummary: { stageId: string; count: number; totalValue: number }[] = []
  let stageAvgDwellDays: Record<string, number> = {}

  const activePipelineRow = pipelineId ? pipelineRows.find((p) => p.id === pipelineId) : undefined
  const isJobsPipeline = activePipelineRow?.pipedrivePipelineId === JOBS_PIPELINE_PIPEDRIVE_ID

  if (pipelineId && isJobsPipeline) {
    const pipelineStageIds = stageRows.filter((s) => s.pipelineId === pipelineId).map((s) => s.id)
    const baseConditions: SQL[] = pipelineStageIds.length > 0 ? [inArray(jobs.stageId, pipelineStageIds)] : [sql`false`]

    if (!includeAged) {
      baseConditions.push(isNull(jobs.archivedAt))
      for (const stage of stageRows) {
        if (stage.autoHideAfterDays == null) continue
        const cutoff = new Date(Date.now() - stage.autoHideAfterDays * 86_400_000).toISOString()
        baseConditions.push(not(and(eq(jobs.stageId, stage.id), lt(jobs.stageEnteredAt, cutoff))!))
      }
    }
    if (search) {
      const like = `%${search}%`
      const searchOr = or(ilike(jobs.pipedriveDealTitle, like), ilike(jobs.address, like), ilike(clients.name, like))
      if (searchOr) baseConditions.push(searchOr)
    }
    // Previously missing entirely on this branch — the Advanced Filter dialog silently had no
    // effect on the Jobs Pipeline board. Now shares the exact same engine saved filters use here.
    const adHocSql = buildAdHocFilterSql(rawConditions, matchMode, { ...JOBS_SAVED_FILTER_TARGET, customFieldTypes })
    if (adHocSql) baseConditions.push(adHocSql)
    if (savedFilterTree) {
      const savedFilterSql = buildSavedFilterSql(savedFilterTree, { ...JOBS_SAVED_FILTER_TARGET, customFieldTypes })
      if (savedFilterSql) baseConditions.push(savedFilterSql)
    }

    const where = stageId ? and(...baseConditions, eq(jobs.stageId, stageId)) : and(...baseConditions)
    const summaryWhere = and(...baseConditions)

    const JOB_LIST_COLUMNS = {
      id: jobs.id,
      pipelineId: sql<string>`${pipelineId}`,
      stageId: jobs.stageId,
      title: jobs.pipedriveDealTitle,
      value: jobs.totalValue,
      currency: sql<string>`'AUD'`,
      status: sql<'won'>`'won'`,
      pipedriveDealId: jobs.pipedriveDealId,
      orgName: clients.name,
      personName: sql<string | null>`null`,
      lostReason: sql<string | null>`null`,
      wonAt: jobs.dateWon,
      lostAt: sql<string | null>`null`,
      jobId: jobs.id,
      stageEnteredAt: jobs.stageEnteredAt,
      createdAt: jobs.dateWon,
      updatedAt: jobs.dateWon,
      isJob: sql<boolean>`true`,
      archivedAt: jobs.archivedAt,
    }

    const orderColumn = sortKey === 'value' ? jobs.totalValue : sortKey === 'title' ? jobs.pipedriveDealTitle : undefined
    const orderBy = orderColumn ? (sortDir === 'desc' ? desc(orderColumn) : asc(orderColumn)) : desc(jobs.dateWon)

    const [dealRows, countRows, summaryRows, avgDwellRows] = await Promise.all([
      db.select(JOB_LIST_COLUMNS).from(jobs).leftJoin(clients, eq(clients.id, jobs.clientId)).where(where).orderBy(orderBy).limit(limit).offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(jobs).leftJoin(clients, eq(clients.id, jobs.clientId)).where(where),
      !includeSummary
        ? Promise.resolve([])
        : db
            .select({
              stageId: jobs.stageId,
              count: sql<number>`count(*)::int`,
              totalValue: sql<string>`coalesce(sum(${jobs.totalValue}), 0)`,
            })
            .from(jobs)
            .leftJoin(clients, eq(clients.id, jobs.clientId))
            .where(summaryWhere)
            .groupBy(jobs.stageId),
      includeSummary && pipelineStageIds.length > 0
        ? db
            .select({
              stageId: crmDealStageHistory.stageId,
              avgSeconds: sql<string>`avg(extract(epoch from (${crmDealStageHistory.exitedAt} - ${crmDealStageHistory.enteredAt})))`,
            })
            .from(crmDealStageHistory)
            .where(and(inArray(crmDealStageHistory.stageId, pipelineStageIds), isNotNull(crmDealStageHistory.exitedAt)))
            .groupBy(crmDealStageHistory.stageId)
        : Promise.resolve([]),
    ])

    deals = dealRows.map((r) => ({ ...r, stageId: r.stageId ?? '' }))
    total = countRows[0]?.count ?? 0
    stageSummary = summaryRows
      .filter((r): r is typeof r & { stageId: string } => r.stageId != null)
      .map((r) => ({ stageId: r.stageId, count: r.count, totalValue: Number(r.totalValue) }))
    stageAvgDwellDays = Object.fromEntries(avgDwellRows.map((r) => [r.stageId, Number(r.avgSeconds) / 86_400]))
  } else if (pipelineId) {
    const baseConditions: SQL[] = [eq(crmDeals.pipelineId, pipelineId)]
    const statusAlreadyGoverned = adHocReferencesStatus || savedFilterReferencesStatus
    if (activePipelineRow?.pipedrivePipelineId === SALES_PIPELINE_PIPEDRIVE_ID && !statusAlreadyGoverned) {
      const excludedStatuses: ('won' | 'lost')[] = []
      if (!includeWon) excludedStatuses.push('won')
      if (!includeLost) excludedStatuses.push('lost')
      if (excludedStatuses.length) baseConditions.push(notInArray(crmDeals.status, excludedStatuses))
    }
    // Generalized "archive after N days" — any stage with autoHideAfterDays set (currently just
    // Jobs Pipeline's "All Done & Paid", 180 days) drops deals that have sat there longer than
    // that from the default view. `?includeAged=1` brings them back without deleting anything.
    if (!includeAged) {
      for (const stage of stageRows) {
        if (stage.autoHideAfterDays == null) continue
        const cutoff = new Date(Date.now() - stage.autoHideAfterDays * 86_400_000).toISOString()
        baseConditions.push(not(and(eq(crmDeals.stageId, stage.id), lt(crmDeals.stageEnteredAt, cutoff))!))
      }
    }
    if (search) {
      const like = `%${search}%`
      const searchOr = or(ilike(crmDeals.title, like), ilike(crmDeals.orgName, like), ilike(crmDeals.personName, like))
      if (searchOr) baseConditions.push(searchOr)
    }
    const adHocSql = buildAdHocFilterSql(rawConditions, matchMode, { ...CRM_DEALS_SAVED_FILTER_TARGET, customFieldTypes })
    if (adHocSql) baseConditions.push(adHocSql)
    if (savedFilterTree) {
      const savedFilterSql = buildSavedFilterSql(savedFilterTree, { ...CRM_DEALS_SAVED_FILTER_TARGET, customFieldTypes })
      if (savedFilterSql) baseConditions.push(savedFilterSql)
    }

    const where = stageId ? and(...baseConditions, eq(crmDeals.stageId, stageId)) : and(...baseConditions)
    const summaryWhere = and(...baseConditions)

    const orderColumn = sortKey ? SORTABLE_COLUMNS[sortKey] : undefined
    const orderBy = orderColumn ? (sortDir === 'desc' ? desc(orderColumn) : asc(orderColumn)) : desc(crmDeals.createdAt)

    const pipelineStageIds = stageRows.filter((s) => s.pipelineId === pipelineId).map((s) => s.id)

    const [dealRows, countRows, summaryRows, avgDwellRows] = await Promise.all([
      db.select(DEAL_LIST_COLUMNS).from(crmDeals).where(where).orderBy(orderBy).limit(limit).offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(crmDeals).where(where),
      !includeSummary
        ? Promise.resolve([])
        : db
            .select({
              stageId: crmDeals.stageId,
              count: sql<number>`count(*)::int`,
              totalValue: sql<string>`coalesce(sum(${crmDeals.value}), 0)`,
            })
            .from(crmDeals)
            .where(summaryWhere)
            .groupBy(crmDeals.stageId),
      // "How long does a deal typically stay here" — averaged over completed stints only
      // (exitedAt IS NOT NULL): an in-progress stay's eventual length is still unknown, so
      // including it would understate the real average. Not scoped by search/filter/stageId —
      // this is a historical stage-level stat, not a property of the current result set.
      includeSummary && pipelineStageIds.length > 0
        ? db
            .select({
              stageId: crmDealStageHistory.stageId,
              avgSeconds: sql<string>`avg(extract(epoch from (${crmDealStageHistory.exitedAt} - ${crmDealStageHistory.enteredAt})))`,
            })
            .from(crmDealStageHistory)
            .where(and(inArray(crmDealStageHistory.stageId, pipelineStageIds), isNotNull(crmDealStageHistory.exitedAt)))
            .groupBy(crmDealStageHistory.stageId)
        : Promise.resolve([]),
    ])

    deals = dealRows
    total = countRows[0]?.count ?? 0
    stageSummary = summaryRows.map((r) => ({ stageId: r.stageId, count: r.count, totalValue: Number(r.totalValue) }))
    stageAvgDwellDays = Object.fromEntries(avgDwellRows.map((r) => [r.stageId, Number(r.avgSeconds) / 86_400]))
  }

  // Same total_value masking convention as data-bootstrap.mts's jobs.totalValue: hide the real
  // number (not the row) for roles without financial access, matching crm.view_financials.
  const financialAccess = canAccessCrm(user)
  const responseDeals = financialAccess ? stripNullsAll(deals) : stripNullsAll(deals).map((d) => ({ ...d, value: null as unknown as number }))
  const responseSummary = financialAccess ? stageSummary : stageSummary.map((s) => ({ ...s, totalValue: null as unknown as number }))

  return Response.json({
    pipelines: stripNullsAll(pipelineRows),
    stages: stripNullsAll(stageRows),
    // Only the initial no-pipelineId bootstrap call (CrmDataContext.refetch) ever reads these back
    // out of the response — every per-pipeline queryDeals call now fetches fieldDefinitionRows too
    // (needed internally to type-cast custom-field filter comparisons, see customFieldTypesFrom),
    // but echoing it back on every one of those would just be the same redundant-payload mistake
    // already fixed here once for stageSummary/avgDwell.
    fieldDefinitions: pipelineId ? [] : stripNullsAll(fieldDefinitionRows),
    savedFilters: pipelineId ? [] : stripNullsAll(savedFilterRows),
    deals: responseDeals,
    total,
    stageSummary: responseSummary,
    stageAvgDwellDays,
  })
})

export const config = {
  path: '/api/crm-data',
}
