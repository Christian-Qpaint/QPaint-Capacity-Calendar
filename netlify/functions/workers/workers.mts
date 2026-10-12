import { eq } from 'drizzle-orm'
import { getDb } from '../_shared/db.js'
import { requireOfficeRole, withErrorHandling, HttpError } from '../_shared/authz.js'
import { parseJsonBody } from '../_shared/http.js'
import { stripNulls } from '../_shared/rows.js'
import { workers } from '../../../db/schema.js'
import { inviteWorker, siteBaseUrl } from '../_shared/invites.js'

function dateOrNull(v: unknown): string | null {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null
}

function toTickets(v: unknown): { name: string; number: string; expiryDate: string | null }[] {
  if (!Array.isArray(v)) return []
  return v
    .filter((t): t is Record<string, unknown> => !!t && typeof t === 'object')
    .map((t) => ({
      name: typeof t.name === 'string' ? t.name.trim() : '',
      number: typeof t.number === 'string' ? t.number.trim() : '',
      expiryDate: dateOrNull(t.expiryDate),
    }))
    .filter((t) => t.name || t.number)
}

function toValues(body: Record<string, unknown>) {
  return {
    firstName: body.firstName as string,
    lastName: body.lastName as string,
    phone: (body.phone as string | undefined) ?? '',
    email: (body.email as string | undefined) ?? '',
    address: (body.address as string | undefined) ?? '',
    position: (body.position as string | undefined) ?? '',
    workerType: body.workerType as 'Internal' | 'Contractor',
    contractorId: (body.contractorId as string | undefined) ?? null,
    whiteCardNumber: (body.whiteCardNumber as string | undefined) ?? '',
    qbuildInductionDone: (body.qbuildInductionDone as boolean | undefined) ?? false,
    qbuildInductionVerified: (body.qbuildInductionVerified as boolean | undefined) ?? false,
    dateOfBirth: dateOrNull(body.dateOfBirth),
    startDate: dateOrNull(body.startDate),
    driversLicenceNumber: (body.driversLicenceNumber as string | undefined) ?? '',
    driversLicenceExpiry: dateOrNull(body.driversLicenceExpiry),
    whiteCardIssueDate: dateOrNull(body.whiteCardIssueDate),
    qbuildInductionDate: dateOrNull(body.qbuildInductionDate),
    otherTickets: toTickets(body.otherTickets),
  }
}

export default withErrorHandling(async (req: Request) => {
  const actor = await requireOfficeRole(req)
  const db = getDb()
  const params = new URL(req.url).searchParams
  const id = params.get('id')

  // "Send invite" on an existing worker — also re-emails a pending invite.
  if (req.method === 'POST' && params.get('action') === 'invite') {
    if (!id) throw new HttpError(400, 'Missing id')
    const [worker] = await db.select().from(workers).where(eq(workers.id, id)).limit(1)
    if (!worker) throw new HttpError(404, 'Worker not found')
    const result = await inviteWorker(db, worker, actor, siteBaseUrl(req), { resendIfPending: true })
    return Response.json({ inviteStatus: result.status, inviteError: result.error })
  }

  if (req.method === 'POST') {
    const body = await parseJsonBody(req)
    const [created] = await db.insert(workers).values(toValues(body)).returning()
    // A new worker with an email is invited to QPaint OS automatically. This can never fail the
    // create — the worker is already saved; the outcome is just reported back for the toast.
    let invite: { status: string; error?: string } = { status: 'email_failed' }
    try {
      invite = await inviteWorker(db, created, actor, siteBaseUrl(req), { resendIfPending: false })
    } catch (err) {
      console.error('Auto-invite failed', err)
    }
    return Response.json({ ...stripNulls(created), inviteStatus: invite.status, inviteError: invite.error })
  }

  if (!id) throw new HttpError(400, 'Missing id')

  if (req.method === 'PATCH') {
    const body = await parseJsonBody(req)
    const [updated] = await db.update(workers).set(toValues(body)).where(eq(workers.id, id)).returning()
    if (!updated) throw new HttpError(404, 'Worker not found')
    return Response.json(stripNulls(updated))
  }

  if (req.method === 'DELETE') {
    await db.delete(workers).where(eq(workers.id, id))
    return Response.json({ ok: true })
  }

  throw new HttpError(405, 'Method not allowed')
})

export const config = {
  path: '/api/workers',
}
