import { eq } from 'drizzle-orm'
import { getDb } from '../_shared/db.js'
import { requireOwnerRole, withErrorHandling, HttpError } from '../_shared/authz.js'
import { parseJsonBody } from '../_shared/http.js'
import { stripNulls } from '../_shared/rows.js'
import { crmFieldDefinitions } from '../../../db/schema.js'

const FIELD_TYPES = ['text', 'number', 'date', 'boolean', 'select', 'multiselect', 'address', 'monetary'] as const
type FieldType = (typeof FIELD_TYPES)[number]

function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function toValues(body: Record<string, unknown>) {
  return {
    label: body.label as string,
    fieldType: body.fieldType as FieldType,
    options: (body.options as { id: string; label: string }[] | undefined) ?? null,
    order: (body.order as number | undefined) ?? 0,
  }
}

export default withErrorHandling(async (req: Request) => {
  await requireOwnerRole(req)
  const db = getDb()
  const id = new URL(req.url).searchParams.get('id')

  if (req.method === 'POST') {
    const body = await parseJsonBody(req)
    const values = toValues(body)
    // Fields added after seeding always get a `local_` key — Pipedrive's own opaque hashes are
    // reserved for fields the seed script creates, so there's never any ambiguity about origin.
    const key = `local_${slugify(values.label)}_${crypto.randomUUID().slice(0, 8)}`
    const [created] = await db.insert(crmFieldDefinitions).values({ ...values, key }).returning()
    return Response.json(stripNulls(created))
  }

  if (!id) throw new HttpError(400, 'Missing id')

  if (req.method === 'PATCH') {
    const body = await parseJsonBody(req)
    const [updated] = await db
      .update(crmFieldDefinitions)
      .set({ ...toValues(body), updatedAt: new Date().toISOString() })
      .where(eq(crmFieldDefinitions.id, id))
      .returning()
    if (!updated) throw new HttpError(404, 'Field definition not found')
    return Response.json(stripNulls(updated))
  }

  if (req.method === 'DELETE') {
    // Deleting a definition leaves any existing deals' `fields` jsonb key alone (invisible once
    // nothing renders it) — scrubbing it from every deal would be an expensive bulk update for no
    // real benefit.
    await db.delete(crmFieldDefinitions).where(eq(crmFieldDefinitions.id, id))
    return Response.json({ ok: true })
  }

  throw new HttpError(405, 'Method not allowed')
})

export const config = {
  path: '/api/crm-field-definitions',
}
