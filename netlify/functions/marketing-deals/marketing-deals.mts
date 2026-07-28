import { inArray, ne, sql } from 'drizzle-orm'
import { getDb } from '../_shared/db.js'
import { requireMarketingImport, withErrorHandling, HttpError } from '../_shared/authz.js'
import { parseJsonBody } from '../_shared/http.js'
import { marketingDeals } from '../../../db/schema.js'

interface DealInput {
  externalId?: string | null
  title?: string | null
  referralSource: string
  salesperson?: string | null
  rawStage?: string | null
  isQuoted: boolean
  isWon: boolean
  value: number
  createdDate: string
  eventDate?: string | null
  importBatchId: string
  pipeline?: string | null
  lostReason?: string | null
  expectedCloseDate?: string | null
  importSource?: string | null
}

export default withErrorHandling(async (req: Request) => {
  await requireMarketingImport(req)
  const db = getDb()
  const url = new URL(req.url)

  if (req.method === 'POST') {
    // One chunk of an import — the client (chunkedImportDeals) sends batches of ~300 rows at a
    // time and reports progress between calls; this endpoint just upserts whatever batch it gets.
    const body = await parseJsonBody(req)
    const rows = body.deals as DealInput[]
    if (!rows || rows.length === 0) return Response.json({ imported: 0 })

    const saved = await db
      .insert(marketingDeals)
      .values(
        rows.map((r) => ({
          externalId: r.externalId ?? null,
          title: r.title ?? null,
          referralSource: r.referralSource,
          salesperson: r.salesperson ?? null,
          rawStage: r.rawStage ?? null,
          isQuoted: r.isQuoted,
          isWon: r.isWon,
          value: r.value,
          createdDate: r.createdDate,
          eventDate: r.eventDate ?? null,
          importBatchId: r.importBatchId,
          pipeline: r.pipeline ?? null,
          lostReason: r.lostReason ?? null,
          expectedCloseDate: r.expectedCloseDate ?? null,
          importSource: r.importSource ?? null,
        })),
      )
      // Re-importing the same export (e.g. a lead that's since been quoted or won) should refresh
      // every column, matching the old `.upsert(rows, { onConflict: 'external_id' })` behavior —
      // `excluded.*` refers to the specific conflicting row's proposed values in a multi-row upsert.
      .onConflictDoUpdate({
        target: marketingDeals.externalId,
        set: {
          title: sql`excluded.title`,
          referralSource: sql`excluded.referral_source`,
          salesperson: sql`excluded.salesperson`,
          rawStage: sql`excluded.raw_stage`,
          isQuoted: sql`excluded.is_quoted`,
          isWon: sql`excluded.is_won`,
          value: sql`excluded.value`,
          createdDate: sql`excluded.created_date`,
          eventDate: sql`excluded.event_date`,
          importBatchId: sql`excluded.import_batch_id`,
          pipeline: sql`excluded.pipeline`,
          lostReason: sql`excluded.lost_reason`,
          expectedCloseDate: sql`excluded.expected_close_date`,
          importSource: sql`excluded.import_source`,
        },
      })
      .returning({ id: marketingDeals.id })
    return Response.json({ imported: saved.length })
  }

  if (req.method === 'DELETE') {
    if (url.searchParams.get('all') === 'true') {
      await db.delete(marketingDeals).where(ne(marketingDeals.id, '00000000-0000-0000-0000-000000000000'))
      return Response.json({ ok: true })
    }
    const batchIdsParam = url.searchParams.get('importBatchIds')
    if (!batchIdsParam) throw new HttpError(400, 'Missing importBatchIds or all=true')
    const batchIds = batchIdsParam.split(',').filter(Boolean)
    if (batchIds.length === 0) return Response.json({ ok: true })
    await db.delete(marketingDeals).where(inArray(marketingDeals.importBatchId, batchIds))
    return Response.json({ ok: true })
  }

  throw new HttpError(405, 'Method not allowed')
})

export const config = {
  path: '/api/marketing-deals',
}
