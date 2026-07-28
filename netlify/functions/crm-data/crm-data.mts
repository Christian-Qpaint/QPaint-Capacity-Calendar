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
import { asc, desc, eq, and, or, ilike, ne, lt, lte, gt, gte, sql, type SQL, type AnyColumn } from 'drizzle-orm'
import { getDb } from '../_shared/db.js'
import { requireOfficeRole, isOfficeRole, withErrorHandling } from '../_shared/authz.js'
import { stripNullsAll } from '../_shared/rows.js'
import { crmPipelines, crmStages, crmFieldDefinitions, crmDeals } from '../../../db/schema.js'

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

interface RawCondition {
  field: string
  operator: string
  value: string
}

function conditionToSql(c: RawCondition): SQL | undefined {
  const col = FILTER_COLUMNS[c.field]
  if (!col || c.value === '' || c.value == null) return undefined

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

function buildFilterConditions(conditionsParam: string | null, matchMode: string | null): SQL[] {
  if (!conditionsParam) return []
  let raw: RawCondition[]
  try {
    raw = JSON.parse(conditionsParam)
  } catch {
    return []
  }
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
  const user = await requireOfficeRole(req)
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

  const [pipelineRows, stageRows, fieldDefinitionRows] = await Promise.all([
    db.select().from(crmPipelines).orderBy(asc(crmPipelines.order)),
    db.select().from(crmStages).orderBy(asc(crmStages.order)),
    db.select().from(crmFieldDefinitions).orderBy(asc(crmFieldDefinitions.order)),
  ])

  type DealListRow = { [K in keyof typeof DEAL_LIST_COLUMNS]: (typeof crmDeals.$inferSelect)[K] }
  let deals: DealListRow[] = []
  let total = 0
  let stageSummary: { stageId: string; count: number; totalValue: number }[] = []

  if (pipelineId) {
    const baseConditions: SQL[] = [eq(crmDeals.pipelineId, pipelineId)]
    if (search) {
      const like = `%${search}%`
      const searchOr = or(ilike(crmDeals.title, like), ilike(crmDeals.orgName, like), ilike(crmDeals.personName, like))
      if (searchOr) baseConditions.push(searchOr)
    }
    baseConditions.push(...buildFilterConditions(conditionsParam, matchMode))

    const where = stageId ? and(...baseConditions, eq(crmDeals.stageId, stageId)) : and(...baseConditions)
    const summaryWhere = and(...baseConditions)

    const orderColumn = sortKey ? SORTABLE_COLUMNS[sortKey] : undefined
    const orderBy = orderColumn ? (sortDir === 'desc' ? desc(orderColumn) : asc(orderColumn)) : desc(crmDeals.createdAt)

    const [dealRows, countRows, summaryRows] = await Promise.all([
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
    ])

    deals = dealRows
    total = countRows[0]?.count ?? 0
    stageSummary = summaryRows.map((r) => ({ stageId: r.stageId, count: r.count, totalValue: Number(r.totalValue) }))
  }

  // Same total_value masking convention as data-bootstrap.mts's jobs.totalValue: hide the real
  // number (not the row) for roles without financial access, matching crm.view_financials.
  const financialAccess = isOfficeRole(user)
  const responseDeals = financialAccess ? stripNullsAll(deals) : stripNullsAll(deals).map((d) => ({ ...d, value: null as unknown as number }))
  const responseSummary = financialAccess ? stageSummary : stageSummary.map((s) => ({ ...s, totalValue: null as unknown as number }))

  return Response.json({
    pipelines: stripNullsAll(pipelineRows),
    stages: stripNullsAll(stageRows),
    fieldDefinitions: stripNullsAll(fieldDefinitionRows),
    deals: responseDeals,
    total,
    stageSummary: responseSummary,
  })
})

export const config = {
  path: '/api/crm-data',
}
