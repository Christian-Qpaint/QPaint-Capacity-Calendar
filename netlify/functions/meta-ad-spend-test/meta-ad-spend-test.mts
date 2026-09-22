// Owner-only diagnostic endpoint — fetches raw ad spend data straight from the Meta Marketing
// API's insights endpoint so we can see exactly what Meta returns before deciding how it maps
// onto QPaint's referral sources. Not wired to any scheduled sync or the ad_spend table yet;
// this is intentionally read-only and manually triggered (see MetaAdSpendTest.tsx's "Fetch"
// button) until the real integration is scoped.
import { HttpError, requireOwnerRole, withErrorHandling } from '../_shared/authz.js'

const GRAPH_API_VERSION = 'v21.0'

interface MetaInsightRow {
  campaign_id?: string
  campaign_name?: string
  spend?: string
  impressions?: string
  clicks?: string
  cpc?: string
  ctr?: string
  date_start?: string
  date_stop?: string
}

export default withErrorHandling(async (req: Request) => {
  await requireOwnerRole(req)

  const accessToken = process.env.META_ACCESS_TOKEN
  const rawAdAccountId = process.env.META_AD_ACCOUNT_ID
  if (!accessToken || !rawAdAccountId) {
    throw new HttpError(500, 'META_ACCESS_TOKEN / META_AD_ACCOUNT_ID is not configured in this environment')
  }
  // Meta's Graph API only exposes an /insights edge on the "act_<id>" ad-account object — a bare
  // numeric ID 404s on that edge with a confusing "nonexisting field (insights)" error instead of
  // a clear "wrong ID" one, so normalize it here rather than making every caller remember the prefix.
  const adAccountId = rawAdAccountId.startsWith('act_') ? rawAdAccountId : `act_${rawAdAccountId}`

  const accountUrl = new URL(`https://graph.facebook.com/${GRAPH_API_VERSION}/${adAccountId}`)
  accountUrl.searchParams.set('fields', 'name,currency')
  accountUrl.searchParams.set('access_token', accessToken)

  const insightsUrl = new URL(`https://graph.facebook.com/${GRAPH_API_VERSION}/${adAccountId}/insights`)
  insightsUrl.searchParams.set('level', 'campaign')
  insightsUrl.searchParams.set('fields', ['campaign_id', 'campaign_name', 'spend', 'impressions', 'clicks', 'cpc', 'ctr', 'date_start', 'date_stop'].join(','))
  insightsUrl.searchParams.set('date_preset', 'last_30d')
  insightsUrl.searchParams.set('limit', '500')
  insightsUrl.searchParams.set('access_token', accessToken)

  const [accountRes, insightsRes] = await Promise.all([fetch(accountUrl), fetch(insightsUrl)])
  const [accountBody, insightsBody] = (await Promise.all([accountRes.json(), insightsRes.json()])) as [
    { name?: string; currency?: string } | undefined,
    { data?: MetaInsightRow[]; error?: { message?: string } } | undefined,
  ]

  if (!insightsRes.ok) {
    throw new HttpError(insightsRes.status, insightsBody?.error?.message ?? 'Meta insights request failed')
  }

  const rows = insightsBody?.data ?? []
  const entries = rows.map((row) => ({
    campaignId: row.campaign_id ?? '',
    source: row.campaign_name ?? 'Unknown campaign',
    spend: Number(row.spend ?? 0),
    impressions: Number(row.impressions ?? 0),
    clicks: Number(row.clicks ?? 0),
    cpc: row.cpc ? Number(row.cpc) : null,
    ctr: row.ctr ? Number(row.ctr) : null,
    dateStart: row.date_start ?? '',
    dateStop: row.date_stop ?? '',
  }))

  return Response.json({
    accountName: accountRes.ok ? (accountBody?.name ?? null) : null,
    currency: accountRes.ok ? (accountBody?.currency ?? 'AUD') : 'AUD',
    entries,
  })
})

export const config = {
  path: '/api/meta-ad-spend-test',
}
