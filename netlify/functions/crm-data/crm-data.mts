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
import { asc, desc, eq, and, or, not, ilike, ne, notInArray, inArray, isNotNull, lt, lte, gt, gte, sql, type SQL, type AnyColumn } from 'drizzle-orm'
import { getDb } from '../_shared/db.js'
import { requireCrmAccess, canAccessCrm, withErrorHandling, HttpError } from '../_shared/authz.js'
import { stripNullsAll } from '../_shared/rows.js'
import { buildSavedFilterSql, savedFilterReferencesField, type SavedFilterNode } from '../_shared/savedFilterSql.js'
import { crmPipelines, crmStages, crmFieldDefinitions, crmDeals, crmSavedFilters, crmDealStageHistory } from '../../../db/schema.js'

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

const FILTER_COLUMNS: Record<string, AnyColumn> = {
  title: crmDeals.title,
  orgName: crmDeals.orgName,
  personName: crmDeals.personName,
  currency: crmDeals.currency,
  value: crmDeals.value,
  status: crmDeals.status,
  stageId: crmDeals.stageId,
  createdAt: crmDeals.createdAt,
}
const TEXT_FIELDS = new Set(['title', 'orgName', 'personName', 'currency'])
const NUMBER_FIELDS = new Set(['value'])
const ENUM_FIELDS = new Set(['status', 'stageId'])
const DATE_FIELDS = new Set(['createdAt'])

// The advanced filter's only two custom-field options — Category and Referral Source — compared
// as text against the `fields` jsonb blob. Not a general "filter on any custom field" mechanism:
// loading the rest of the ~90-key blob back for every list row is the exact cost crm-data.mts's
// list query was rewritten to avoid, so this stays limited to these two named fields rather than
// looking any key up dynamically.
const CUSTOM_FILTER_FIELD_KEYS: Record<string, string> = {
  category: '27b0830b634b7730cc4cc6680db2ac2c7391ee77',
  referralSource: 'e7f330cf1cbe354a1592472798c8709842330bee',
}

interface RawCondition {
  field: string
  operator: string
  value: string
}

function conditionToSql(c: RawCondition): SQL | undefined {
  if (c.value === '' || c.value == null) return undefined

  const customKey = CUSTOM_FILTER_FIELD_KEYS[c.field]
  if (customKey) {
    const expr = sql`(${crmDeals.fields} ->> ${customKey})`
    if (c.operator === 'equals') return sql`${expr} = ${c.value}`
    if (c.operator === 'not_equals') return sql`${expr} != ${c.value}`
    return undefined
  }

  const col = FILTER_COLUMNS[c.field]
  if (!col) return undefined

  if (TEXT_FIELDS.has(c.field)) {
    if (c.operator === 'contains') return ilike(col, `%${c.value}%`)
    if (c.operator === 'equals') return eq(col, c.value)
    if (c.operator === 'not_equals') return ne(col, c.value)
    return undefined
  }
  if (NUMBER_FIELDS.has(c.field)) {
    const n = Number(c.value)
    if (Number.isNaN(n)) return undefined
    switch (c.operator) {
      case 'eq': return eq(col, n)
      case 'neq': return ne(col, n)
      case 'lt': return lt(col, n)
      case 'lte': return lte(col, n)
      case 'gt': return gt(col, n)
      case 'gte': return gte(col, n)
      default: return undefined
    }
  }
  if (ENUM_FIELDS.has(c.field)) {
    if (c.operator === 'equals') return eq(col, c.value)
    if (c.operator === 'not_equals') return ne(col, c.value)
    return undefined
  }
  if (DATE_FIELDS.has(c.field)) {
    if (c.operator === 'on') return sql`${col}::date = ${c.value}::date`
    if (c.operator === 'before') return sql`${col}::date < ${c.value}::date`
    if (c.operator === 'after') return sql`${col}::date > ${c.value}::date`
    return undefined
  }
  return undefined
}

function parseConditions(conditionsParam: string | null): RawCondition[] {
  if (!conditionsParam) return []
  try {
    return JSON.parse(conditionsParam)
  } catch {
    return []
  }
}

function buildFilterConditions(raw: RawCondition[], matchMode: string | null): SQL[] {
  const parts = raw.map(conditionToSql).filter((x): x is SQL => !!x)
  if (parts.length === 0) return []
  const combined = matchMode === 'OR' ? or(...parts) : and(...parts)
  return combined ? [combined] : []
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

  const [pipelineRows, stageRows, fieldDefinitionRows, savedFilterRows] = await Promise.all([
    db.select().from(crmPipelines).orderBy(asc(crmPipelines.order)),
    db.select().from(crmStages).orderBy(asc(crmStages.order)),
    db.select().from(crmFieldDefinitions).orderBy(asc(crmFieldDefinitions.order)),
    db
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

  const rawConditions = parseConditions(conditionsParam)
  // If whatever's already selected (ad-hoc condition or saved filter) has its own opinion about
  // `status` — e.g. Pipedrive's real "All lost deals" filter — the hard default exclusion below
  // backs off instead of AND-ing against it and silently returning zero rows.
  const adHocReferencesStatus = rawConditions.some((c) => c.field === 'status')

  let savedFilterSql: SQL | undefined
  let savedFilterReferencesStatus = false
  if (savedFilterId) {
    const [savedFilter] = await db.select().from(crmSavedFilters).where(eq(crmSavedFilters.id, savedFilterId)).limit(1)
    if (!savedFilter) throw new HttpError(404, 'Saved filter not found')
    if (!savedFilter.supported) throw new HttpError(400, `This filter can't run here — ${savedFilter.unsupportedReason ?? 'unsupported'}`)
    const tree = savedFilter.conditions as SavedFilterNode
    savedFilterSql = buildSavedFilterSql(tree)
    savedFilterReferencesStatus = savedFilterReferencesField(tree, 'status')
  }

  type DealListRow = { [K in keyof typeof DEAL_LIST_COLUMNS]: (typeof crmDeals.$inferSelect)[K] }
  let deals: DealListRow[] = []
  let total = 0
  let stageSummary: { stageId: string; count: number; totalValue: number }[] = []
  let stageAvgDwellDays: Record<string, number> = {}

  if (pipelineId) {
    const baseConditions: SQL[] = [eq(crmDeals.pipelineId, pipelineId)]
    const activePipelineRow = pipelineRows.find((p) => p.id === pipelineId)
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
    baseConditions.push(...buildFilterConditions(rawConditions, matchMode))
    if (savedFilterSql) baseConditions.push(savedFilterSql)

    const where = stageId ? and(...baseConditions, eq(crmDeals.stageId, stageId)) : and(...baseConditions)
    const summaryWhere = and(...baseConditions)

    const orderColumn = sortKey ? SORTABLE_COLUMNS[sortKey] : undefined
    const orderBy = orderColumn ? (sortDir === 'desc' ? desc(orderColumn) : asc(orderColumn)) : desc(crmDeals.createdAt)

    const pipelineStageIds = stageRows.filter((s) => s.pipelineId === pipelineId).map((s) => s.id)

    const [dealRows, countRows, summaryRows, avgDwellRows] = await Promise.all([
      db.select(DEAL_LIST_COLUMNS).from(crmDeals).where(where).orderBy(orderBy).limit(limit).offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(crmDeals).where(where),
      db
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
      pipelineStageIds.length > 0
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
    fieldDefinitions: stripNullsAll(fieldDefinitionRows),
    savedFilters: stripNullsAll(savedFilterRows),
    deals: responseDeals,
    total,
    stageSummary: responseSummary,
    stageAvgDwellDays,
  })
})

export const config = {
  path: '/api/crm-data',
}
