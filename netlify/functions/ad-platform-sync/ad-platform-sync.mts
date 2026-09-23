// Owner-only — pulls one calendar month of campaign data from an ad platform's own API and saves
// it into ad_platform_campaigns, replacing whatever was previously saved for that exact
// (platform, month) pair. Triggered by the Ads Management page's "Fetch" button and by its month
// navigation (see AdsManagement.tsx) — both call this the same way, since "fetch the month you're
// looking at" is the whole point of both actions.
import { and, eq, sql } from 'drizzle-orm'
import { getDb } from '../_shared/db.js'
import { HttpError, requireOwnerRole, withErrorHandling } from '../_shared/authz.js'
import { parseJsonBody } from '../_shared/http.js'
import { fetchMetaCampaigns } from '../_shared/metaAds.js'
import { adPlatformCampaigns } from '../../../db/schema.js'

const MONTH_PATTERN = /^\d{4}-\d{2}$/

export default withErrorHandling(async (req: Request) => {
  await requireOwnerRole(req)
  if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed')

  const body = await parseJsonBody(req)
  const platform = body.platform as string
  const month = body.month as string
  if (!month || !MONTH_PATTERN.test(month)) throw new HttpError(400, 'month must be "YYYY-MM"')

  let result: { accountName: string | null; currency: string; rows: Awaited<ReturnType<typeof fetchMetaCampaigns>>['rows'] }
  if (platform === 'meta') {
    result = await fetchMetaCampaigns(month)
  } else if (platform === 'google') {
    throw new HttpError(400, 'Google Ads is not configured yet')
  } else {
    throw new HttpError(400, `Unknown platform: ${platform}`)
  }

  const db = getDb()
  const saved = await db.transaction(async (tx) => {
    await tx.delete(adPlatformCampaigns).where(and(eq(adPlatformCampaigns.platform, platform), eq(adPlatformCampaigns.month, month)))
    if (result.rows.length === 0) return []
    return tx
      .insert(adPlatformCampaigns)
      .values(
        result.rows.map((row) => ({
          platform,
          month,
          campaignId: row.campaignId,
          source: row.source,
          spend: row.spend,
          impressions: row.impressions,
          reach: row.reach,
          frequency: row.frequency,
          clicks: row.clicks,
          cpc: row.cpc,
          ctr: row.ctr,
          cpm: row.cpm,
          leads: row.leads,
          currency: result.currency,
          dateStart: row.dateStart,
          dateStop: row.dateStop,
          updatedAt: new Date().toISOString(),
        })),
      )
      // The delete above already clears out this exact (platform, month) slice, so a conflict
      // here should be rare — but two syncs firing back to back (a double-click, or React
      // StrictMode's dev-only double effect invocation) can genuinely race between the delete and
      // insert. Falling back to "last write wins" here means that races into a 500 instead.
      .onConflictDoUpdate({
        target: [adPlatformCampaigns.platform, adPlatformCampaigns.month, adPlatformCampaigns.campaignId],
        set: {
          source: sql`excluded.source`,
          spend: sql`excluded.spend`,
          impressions: sql`excluded.impressions`,
          reach: sql`excluded.reach`,
          frequency: sql`excluded.frequency`,
          clicks: sql`excluded.clicks`,
          cpc: sql`excluded.cpc`,
          ctr: sql`excluded.ctr`,
          cpm: sql`excluded.cpm`,
          leads: sql`excluded.leads`,
          currency: sql`excluded.currency`,
          dateStart: sql`excluded.date_start`,
          dateStop: sql`excluded.date_stop`,
          updatedAt: sql`excluded.updated_at`,
        },
      })
      .returning()
  })

  return Response.json({ accountName: result.accountName, currency: result.currency, rows: saved })
})

export const config = {
  path: '/api/ad-platform-sync',
}
