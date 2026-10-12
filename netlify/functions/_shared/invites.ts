// Shared invite logic: creating an invite, emailing it (via Resend), and deciding whether a
// worker should be invited automatically. Used by user-invites.mts (Settings → Invites) and
// workers.mts (auto-invite on worker create / "Send invite" on a worker).
import { and, eq, isNull } from 'drizzle-orm'
import { userInvites, users } from '../../../db/schema.js'
import { getDb } from './db.js'

type Db = ReturnType<typeof getDb>
type Role = (typeof users.$inferSelect)['role']
type InviteRow = typeof userInvites.$inferSelect
type UserRow = typeof users.$inferSelect

export const INVITE_LIFETIME_DAYS = 7

const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner / Management',
  ops_manager: 'Operations Manager',
  scheduler_pm: 'Scheduler / PM',
  team_leader_foreperson: 'Team Leader / Foreperson',
  painter_crew_member: 'Painter / Crew Member',
  marketing: 'Marketing',
  admin: 'Admin',
  sales: 'Sales',
}

/** Which login role a worker's position should get. Only internal field staff are auto-invited —
 * contractor staff and Supervisors are left for a person to invite deliberately. */
export function inviteRoleForWorker(w: { workerType: string; position: string }): Role | null {
  if (w.workerType !== 'Internal') return null
  if (w.position === 'Foreman (Crew Leader)') return 'team_leader_foreperson'
  if (w.position === 'Painter' || w.position === 'Apprentice') return 'painter_crew_member'
  return null
}

/** The address the page was opened from (same as the Copy link button), so the emailed link always
 * points at the site the invite was made on; Netlify's URL variable is only a fallback. */
export function siteBaseUrl(req: Request): string {
  const origin = new URL(req.url).origin
  return (origin.startsWith('http') ? origin : process.env.URL ?? origin).replace(/\/$/, '')
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Sends one invite email through Resend. Never throws — returns why it didn't send instead, so a
 * missing/refused email never blocks the invite itself (the link can always be copied). */
async function sendInviteEmail(args: {
  to: string
  role: Role
  link: string
  inviterName: string
  recipientName?: string
}): Promise<{ sent: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.INVITE_FROM_EMAIL
  if (!apiKey || !from) return { sent: false, error: 'Email isn’t set up on this site yet' }

  const roleLabel = ROLE_LABELS[args.role] ?? args.role
  const greeting = args.recipientName ? `Hi ${args.recipientName},` : 'Hi,'
  const subject = 'You’ve been invited to QPaint OS'
  const text = `${greeting}\n\n${args.inviterName} has invited you to QPaint OS as ${roleLabel}.\n\nSet your password and sign in here:\n${args.link}\n\nThis link works once and expires in ${INVITE_LIFETIME_DAYS} days.\n`
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#111">
  <h2 style="margin:0 0 12px">You’re invited to QPaint OS</h2>
  <p>${escapeHtml(greeting)}</p>
  <p>${escapeHtml(args.inviterName)} has invited you to QPaint OS as <strong>${escapeHtml(roleLabel)}</strong>.</p>
  <p style="margin:24px 0"><a href="${escapeHtml(args.link)}" style="background:#111;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">Set your password</a></p>
  <p style="color:#555;font-size:13px">Or paste this link into your browser:<br>${escapeHtml(args.link)}</p>
  <p style="color:#555;font-size:13px">This link works once and expires in ${INVITE_LIFETIME_DAYS} days.</p>
</div>`

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [args.to], subject, html, text }),
    })
    if (res.ok) return { sent: true }
    const detail = (await res.text()).slice(0, 200)
    console.error('Invite email refused', res.status, detail)
    return { sent: false, error: `The email service refused it (${res.status})` }
  } catch (err) {
    console.error('Invite email failed', err)
    return { sent: false, error: 'Could not reach the email service' }
  }
}

/** Emails an existing invite and records whether it went out. */
export async function deliverInvite(
  db: Db,
  invite: InviteRow,
  ctx: { baseUrl: string; inviterName: string; recipientName?: string },
): Promise<InviteRow> {
  const result = await sendInviteEmail({
    to: invite.email,
    role: invite.role,
    link: `${ctx.baseUrl}/accept-invite?token=${invite.token}`,
    inviterName: ctx.inviterName,
    recipientName: ctx.recipientName,
  })
  const [updated] = await db
    .update(userInvites)
    .set(result.sent ? { emailSentAt: new Date().toISOString(), emailError: null } : { emailError: result.error ?? 'Not sent' })
    .where(eq(userInvites.id, invite.id))
    .returning()
  return updated
}

export async function createInvite(
  db: Db,
  args: { email: string; role: Role; createdBy: string; workerId?: string | null; baseUrl: string; inviterName: string; recipientName?: string; sendEmail: boolean },
): Promise<InviteRow> {
  const expiresAt = new Date(Date.now() + INVITE_LIFETIME_DAYS * 86_400_000).toISOString()
  const [created] = await db
    .insert(userInvites)
    .values({ email: args.email, role: args.role, token: crypto.randomUUID(), createdBy: args.createdBy, expiresAt, workerId: args.workerId ?? null })
    .returning()
  // Emailing is always a deliberate click — never a side effect of creating an invite.
  if (!args.sendEmail) return created
  return deliverInvite(db, created, { baseUrl: args.baseUrl, inviterName: args.inviterName, recipientName: args.recipientName })
}

export type WorkerInviteStatus = 'emailed' | 'email_failed' | 'already_has_account' | 'already_invited' | 'no_email' | 'not_eligible'

/** Invites a worker to QPaint OS (if they have an email, an eligible position, and no account). With
 * resendIfPending, an existing unused invite is re-emailed instead of reported as "already invited". */
export async function inviteWorker(
  db: Db,
  worker: { id: string; firstName: string; lastName: string; email: string; workerType: string; position: string },
  actor: UserRow,
  baseUrl: string,
  opts: { resendIfPending: boolean },
): Promise<{ status: WorkerInviteStatus; error?: string }> {
  const email = worker.email.trim().toLowerCase()
  if (!email.includes('@')) return { status: 'no_email' }
  const role = inviteRoleForWorker(worker)
  if (!role) return { status: 'not_eligible' }

  const [existingUser] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1)
  if (existingUser) return { status: 'already_has_account' }

  const [pending] = await db
    .select()
    .from(userInvites)
    .where(and(eq(userInvites.email, email), isNull(userInvites.usedAt)))
    .limit(1)
  if (pending && !opts.resendIfPending) return { status: 'already_invited' }

  const ctx = { baseUrl, inviterName: actor.name, recipientName: worker.firstName }
  let invite: InviteRow
  if (pending) {
    const expiresAt = new Date(Date.now() + INVITE_LIFETIME_DAYS * 86_400_000).toISOString()
    const [refreshed] = await db.update(userInvites).set({ expiresAt, workerId: worker.id }).where(eq(userInvites.id, pending.id)).returning()
    invite = await deliverInvite(db, refreshed, ctx)
  } else {
    invite = await createInvite(db, { email, role, createdBy: actor.id, workerId: worker.id, sendEmail: true, ...ctx })
  }
  return invite.emailSentAt && !invite.emailError ? { status: 'emailed' } : { status: 'email_failed', error: invite.emailError ?? undefined }
}
