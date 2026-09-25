// Manual campaign → referral-source mapping, used from the Ad Spend dialog. Campaign names don't
// match Pipedrive referral source names, so there's nothing to auto-match — a person picks the
// referral source once per campaign here, and it's remembered from then on. Same permission tier
// as ad-spend.mts itself (marketing.import), not owner-only, since this is meant to be used from
// inside the same dialog that role already has access to.
import { desc, eq } from 'drizzle-orm'
import { getDb } from '../_shared/db.js'
import { HttpError, requireMarketingImport, withErrorHandling } from '../_shared/authz.js'
import { parseJsonBody } from '../_shared/http.js'
import { adCampaignSourceMappings, adPlatformCampaigns } from '../../../db/schema.js'

export default withErrorHandling(async (req: Request) => {
  await requireMarketingImport(req)
  const db = getDb()

  if (req.method === 'GET') {
    const mappings = await db.select().from(adCampaignSourceMappings)
    const mappedKeys = new Set(mappings.map((m) => `${m.platform}:${m.campaignId}`))

    // All synced campaign rows, newest month first, collapsed to one (latest) row per campaign —
    // JS-side rather than a SQL DISTINCT ON, since the row count here is small (a handful of
    // campaigns across however many months have been synced) and this keeps the query trivial.
    const allRows = await db.select().from(adPlatformCampaigns).orderBy(desc(adPlatformCampaigns.month))
    const seen = new Set<string>()
    const unmapped: typeof allRows = []
    for (const row of allRows) {
      const key = `${row.platform}:${row.campaignId}`
      if (seen.has(key)) continue
      seen.add(key)
      if (!mappedKeys.has(key)) unmapped.push(row)
    }

    return Response.json({ mappings, unmapped })
  }

  if (req.method === 'POST') {
    const body = await parseJsonBody(req)
    const platform = body.platform as string
    const campaignId = body.campaignId as string
    const source = body.source as string
    const referralSource = body.referralSource as string
    if (!platform || !campaignId || !source || !referralSource) throw new HttpError(400, 'platform, campaignId, source, and referralSource are required')

    const [saved] = await db
      .insert(adCampaignSourceMappings)
      .values({ platform, campaignId, source, referralSource })
      .onConflictDoUpdate({
        target: [adCampaignSourceMappings.platform, adCampaignSourceMappings.campaignId],
        set: { referralSource, source },
      })
      .returning()
    return Response.json(saved)
  }

  if (req.method === 'DELETE') {
    const id = new URL(req.url).searchParams.get('id')
    if (!id) throw new HttpError(400, 'Missing id')
    await db.delete(adCampaignSourceMappings).where(eq(adCampaignSourceMappings.id, id))
    return Response.json({ ok: true })
  }

  throw new HttpError(405, 'Method not allowed')
})

export const config = {
  path: '/api/ad-campaign-mappings',
}
