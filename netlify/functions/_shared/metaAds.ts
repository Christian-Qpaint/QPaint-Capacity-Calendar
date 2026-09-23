// Shared Meta Marketing API fetch logic — used by ad-platform-sync.mts. Kept separate from that
// function so the same fetch can eventually be reused by a scheduled sync without duplicating it.
import { HttpError } from './authz.js'

const GRAPH_API_VERSION = 'v21.0'

// Meta has renamed the action_type for native Lead Ads submissions at least once over the years
// ('lead' historically, 'onsite_conversion.lead_grouped' for newer Instant Forms reporting) — sum
// both so a "lead" always means an on-platform Lead Form submission, never a website/pixel
// conversion, matching the choice made for the Cost Per Lead card.
const LEAD_ACTION_TYPES = new Set(['lead', 'onsite_conversion.lead_grouped'])

interface MetaAction {
  action_type?: string
  value?: string
}

interface MetaInsightRow {
  campaign_id?: string
  campaign_name?: string
  spend?: string
  impressions?: string
  reach?: string
  frequency?: string
  clicks?: string
  cpc?: string
  ctr?: string
  cpm?: string
  actions?: MetaAction[]
  date_start?: string
  date_stop?: string
}

export interface MetaCampaignRow {
  campaignId: string
  source: string
  spend: number
  impressions: number
  reach: number | null
  frequency: number | null
  clicks: number
  cpc: number | null
  ctr: number | null
  cpm: number | null
  leads: number | null
  dateStart: string
  dateStop: string
}

export interface MetaFetchResult {
  accountName: string | null
  currency: string
  rows: MetaCampaignRow[]
}

/** First and last calendar day of a "YYYY-MM" month, as "YYYY-MM-DD" strings. */
export function monthDateRange(month: string): { dateStart: string; dateStop: string } {
  const [year, mo] = month.split('-').map(Number)
  const start = new Date(year, mo - 1, 1)
  const end = new Date(year, mo, 0)
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return { dateStart: iso(start), dateStop: iso(end) }
}

function countLeads(actions: MetaAction[] | undefined): number | null {
  if (!actions) return null
  const total = actions.filter((a) => a.action_type && LEAD_ACTION_TYPES.has(a.action_type)).reduce((sum, a) => sum + Number(a.value ?? 0), 0)
  return total
}

export async function fetchMetaCampaigns(month: string): Promise<MetaFetchResult> {
  const accessToken = process.env.META_ACCESS_TOKEN
  const rawAdAccountId = process.env.META_AD_ACCOUNT_ID
  if (!accessToken || !rawAdAccountId) {
    throw new HttpError(500, 'META_ACCESS_TOKEN / META_AD_ACCOUNT_ID is not configured in this environment')
  }
  // Meta's Graph API only exposes an /insights edge on the "act_<id>" ad-account object — a bare
  // numeric ID 404s on that edge with a confusing "nonexisting field (insights)" error instead of
  // a clear "wrong ID" one, so normalize it here rather than making every caller remember the prefix.
  const adAccountId = rawAdAccountId.startsWith('act_') ? rawAdAccountId : `act_${rawAdAccountId}`

  const { dateStart, dateStop } = monthDateRange(month)

  const accountUrl = new URL(`https://graph.facebook.com/${GRAPH_API_VERSION}/${adAccountId}`)
  accountUrl.searchParams.set('fields', 'name,currency')
  accountUrl.searchParams.set('access_token', accessToken)

  const insightsUrl = new URL(`https://graph.facebook.com/${GRAPH_API_VERSION}/${adAccountId}/insights`)
  insightsUrl.searchParams.set('level', 'campaign')
  insightsUrl.searchParams.set(
    'fields',
    ['campaign_id', 'campaign_name', 'spend', 'impressions', 'reach', 'frequency', 'clicks', 'cpc', 'ctr', 'cpm', 'actions', 'date_start', 'date_stop'].join(
      ',',
    ),
  )
  insightsUrl.searchParams.set('time_range', JSON.stringify({ since: dateStart, until: dateStop }))
  insightsUrl.searchParams.set('limit', '500')
  insightsUrl.searchParams.set('access_token', accessToken)

  const [accountRes, insightsRes] = await Promise.all([fetch(accountUrl), fetch(insightsUrl)])
  const [accountBody, insightsBody] = (await Promise.all([accountRes.json(), insightsRes.json()])) as [
    { name?: string; currency?: string } | undefined,
    { data?: MetaInsightRow[]; error?: { message?: string }; paging?: { next?: string } } | undefined,
  ]

  if (!insightsRes.ok) {
    throw new HttpError(insightsRes.status, insightsBody?.error?.message ?? 'Meta insights request failed')
  }
  if (insightsBody?.paging?.next) {
    // Not expected at a single month's campaign-level granularity for this account's current
    // size, but flagged loudly rather than silently truncating if it ever is.
    throw new HttpError(500, 'Meta returned more campaigns than fit in one page — pagination is not implemented yet')
  }

  const rows = (insightsBody?.data ?? []).map((row) => ({
    campaignId: row.campaign_id ?? '',
    source: row.campaign_name ?? 'Unknown campaign',
    spend: Number(row.spend ?? 0),
    impressions: Number(row.impressions ?? 0),
    reach: row.reach ? Number(row.reach) : null,
    frequency: row.frequency ? Number(row.frequency) : null,
    clicks: Number(row.clicks ?? 0),
    cpc: row.cpc ? Number(row.cpc) : null,
    ctr: row.ctr ? Number(row.ctr) : null,
    cpm: row.cpm ? Number(row.cpm) : null,
    leads: countLeads(row.actions),
    dateStart: row.date_start ?? dateStart,
    dateStop: row.date_stop ?? dateStop,
  }))

  return {
    accountName: accountRes.ok ? (accountBody?.name ?? null) : null,
    currency: accountRes.ok ? (accountBody?.currency ?? 'AUD') : 'AUD',
    rows,
  }
}
