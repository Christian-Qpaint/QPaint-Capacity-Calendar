// Owner-only — stores and serves the Finance page's imported "Aged Payables Detail" reports
// (from Xero). GET returns the latest report by as_at_date; POST saves a freshly-parsed import,
// replacing that exact date's lines wholesale if it's a re-upload of the same snapshot.
import { desc, eq } from 'drizzle-orm'
import { getDb } from '../_shared/db.js'
import { HttpError, requireOwnerRole, withErrorHandling } from '../_shared/authz.js'
import { parseJsonBody } from '../_shared/http.js'
import { stripNullsAll } from '../_shared/rows.js'
import { agedPayablesLines, agedPayablesReports } from '../../../db/schema.js'

interface IncomingLine {
  sortOrder: number
  vendorName: string
  invoiceDate: string | null
  dueDate: string | null
  invoiceReference: string | null
  bucket0: number
  bucket1: number
  bucket2: number
  bucket3: number
  bucketOlder: number
  total: number
}

export default withErrorHandling(async (req: Request) => {
  await requireOwnerRole(req)
  const db = getDb()

  if (req.method === 'GET') {
    const [report] = await db.select().from(agedPayablesReports).orderBy(desc(agedPayablesReports.asAtDate)).limit(1)
    if (!report) return Response.json({ report: null, lines: [] })
    const lines = await db.select().from(agedPayablesLines).where(eq(agedPayablesLines.reportId, report.id))
    lines.sort((a, b) => a.sortOrder - b.sortOrder)
    return Response.json({ report: stripNullsAll([report])[0], lines: stripNullsAll(lines) })
  }

  if (req.method === 'POST') {
    const body = await parseJsonBody(req)
    const asAtDate = body.asAtDate as string
    const grandTotal = body.grandTotal as number
    const incomingLines = body.lines as IncomingLine[]
    if (!asAtDate || !Array.isArray(incomingLines)) throw new HttpError(400, 'asAtDate and lines are required')

    const result = await db.transaction(async (tx) => {
      const [report] = await tx
        .insert(agedPayablesReports)
        .values({ asAtDate, grandTotal, importedAt: new Date().toISOString() })
        .onConflictDoUpdate({
          target: agedPayablesReports.asAtDate,
          set: { grandTotal, importedAt: new Date().toISOString() },
        })
        .returning()

      await tx.delete(agedPayablesLines).where(eq(agedPayablesLines.reportId, report.id))

      const savedLines = incomingLines.length
        ? await tx
            .insert(agedPayablesLines)
            .values(
              incomingLines.map((line) => ({
                reportId: report.id,
                sortOrder: line.sortOrder,
                vendorName: line.vendorName,
                invoiceDate: line.invoiceDate,
                dueDate: line.dueDate,
                invoiceReference: line.invoiceReference,
                bucket0: line.bucket0,
                bucket1: line.bucket1,
                bucket2: line.bucket2,
                bucket3: line.bucket3,
                bucketOlder: line.bucketOlder,
                total: line.total,
              })),
            )
            .returning()
        : []

      return { report, lines: savedLines }
    })

    result.lines.sort((a, b) => a.sortOrder - b.sortOrder)
    return Response.json({ report: stripNullsAll([result.report])[0], lines: stripNullsAll(result.lines) })
  }

  throw new HttpError(405, 'Method not allowed')
})

export const config = {
  path: '/api/finance-aged-payables',
}
