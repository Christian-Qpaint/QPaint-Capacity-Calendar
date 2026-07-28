// Bootstrap read for the Marketing dashboard — mirrors useMarketingData.ts's old fetchAll.
// Unlike Supabase/PostgREST, a raw Drizzle query has no default row cap, so the pagination dance
// useMarketingData.ts used to work around PostgREST's 1000-row limit is no longer needed at all.
import { getDb } from '../_shared/db.js'
import { requireMarketingView, withErrorHandling } from '../_shared/authz.js'
import { stripNullsAll } from '../_shared/rows.js'
import { adSpend, marketingDeals } from '../../../db/schema.js'

export default withErrorHandling(async (req: Request) => {
  await requireMarketingView(req)
  const db = getDb()

  const [adSpendRows, dealRows] = await Promise.all([
    db.select().from(adSpend).orderBy(adSpend.month),
    db.select().from(marketingDeals).orderBy(marketingDeals.createdDate),
  ])

  return Response.json({
    adSpend: stripNullsAll(adSpendRows),
    deals: stripNullsAll(dealRows),
  })
})

export const config = {
  path: '/api/marketing-data',
}
