// Records a deal's stage transitions in crm_deal_stage_history — one row per stint, `exitedAt`
// null meaning "still there". Called from every place a deal's stageId is set: creation (opens
// the first stint) and every stage change (closes whatever stint was open, opens a new one) across
// crm-deals.mts, both Pipedrive webhooks, and the manual pipeline sync. Centralized here so all of
// them share the exact same close-then-open semantics instead of each reimplementing it slightly
// differently.
import { and, eq, isNull } from 'drizzle-orm'
import { getDb } from './db.js'
import { crmDealStageHistory } from '../../../db/schema.js'

export async function recordStageEntry(
  db: ReturnType<typeof getDb>,
  dealId: string,
  stageId: string,
  enteredAt: string = new Date().toISOString(),
): Promise<void> {
  await db
    .update(crmDealStageHistory)
    .set({ exitedAt: enteredAt })
    .where(and(eq(crmDealStageHistory.dealId, dealId), isNull(crmDealStageHistory.exitedAt)))
  await db.insert(crmDealStageHistory).values({ dealId, stageId, enteredAt })
}
