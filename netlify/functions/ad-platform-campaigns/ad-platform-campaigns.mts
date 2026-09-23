// Owner-only — reads previously-synced ad platform campaign rows for a month, straight from
// Supabase (never calls out to Meta/Google itself; that only happens via ad-platform-sync.mts).
// `platform` is optional: omit it to get every platform's rows for that month at once, which is
// what the Ads Management page's "Overview" tab uses to show a combined cross-source view.
import { and, eq } from 'drizzle-orm'
import { getDb } from '../_shared/db.js'
import { HttpError, requireOwnerRole, withErrorHandling } from '../_shared/authz.js'
import { stripNullsAll } from '../_shared/rows.js'
import { adPlatformCampaigns } from '../../../db/schema.js'

const MONTH_PATTERN = /^\d{4}-\d{2}$/

export default withErrorHandling(async (req: Request) => {
  await requireOwnerRole(req)
  const url = new URL(req.url)
  const month = url.searchParams.get('month')
  const platform = url.searchParams.get('platform')
  if (!month || !MONTH_PATTERN.test(month)) throw new HttpError(400, 'month must be "YYYY-MM"')

  const db = getDb()
  const rows = await db
    .select()
    .from(adPlatformCampaigns)
    .where(platform ? and(eq(adPlatformCampaigns.month, month), eq(adPlatformCampaigns.platform, platform)) : eq(adPlatformCampaigns.month, month))

  return Response.json({ rows: stripNullsAll(rows) })
})

export const config = {
  path: '/api/ad-platform-campaigns',
}
