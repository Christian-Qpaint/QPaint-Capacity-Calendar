// Fan a system-generated notification out to every Owner — same pattern request-access.mts
// already established for human-triggered notifications, reused here for the scheduled
// integration-health jobs (pipedrive-webhook-healthcheck.mts, pipedrive-reconcile-sync.mts) so a
// silent background failure surfaces as something a person actually sees, not just a line in
// Netlify's function logs nobody is watching.
import { eq } from 'drizzle-orm'
import { getDb } from './db.js'
import { notifications, users } from '../../../db/schema.js'

export async function notifyOwners(db: ReturnType<typeof getDb>, params: { type: string; title: string; body: string; link?: string }) {
  const owners = await db.select({ id: users.id }).from(users).where(eq(users.role, 'owner'))
  if (owners.length === 0) return
  await db.insert(notifications).values(
    owners.map((o) => ({
      recipientId: o.id,
      type: params.type,
      title: params.title,
      body: params.body,
      link: params.link,
    })),
  )
}
