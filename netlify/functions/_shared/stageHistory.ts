// Records a stage transition in crm_deal_stage_history — one row per stint, `exitedAt` null
// meaning "still there". Called from every place a deal's or job's stageId is set: creation
// (opens the first stint) and every stage change (closes whatever stint was open, opens a new
// one). Centralized here so all callers share the exact same close-then-open semantics instead of
// each reimplementing it slightly differently.
//
// Owner is exactly one of `{ dealId }` (pre-promotion CRM deals — Sales/Business Development) or
// `{ jobId }` (Jobs Pipeline, post Jobs/Jobs-Pipeline merge — a job IS its board card now, no
// separate deal row to key history off) — matches the crm_deal_stage_history XOR check constraint.
import { and, eq, isNull } from 'drizzle-orm'
import { getDb } from './db.js'
import { crmDealStageHistory } from '../../../db/schema.js'

export async function recordStageEntry(
  db: ReturnType<typeof getDb>,
  owner: { dealId: string } | { jobId: string },
  stageId: string,
  enteredAt: string = new Date().toISOString(),
): Promise<void> {
  const ownerCondition = 'dealId' in owner ? eq(crmDealStageHistory.dealId, owner.dealId) : eq(crmDealStageHistory.jobId, owner.jobId)
  await db
    .update(crmDealStageHistory)
    .set({ exitedAt: enteredAt })
    .where(and(ownerCondition, isNull(crmDealStageHistory.exitedAt)))
  await db.insert(crmDealStageHistory).values({ ...owner, stageId, enteredAt })
}
