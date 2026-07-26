import { supabase } from '@/lib/supabaseClient'
import { marketingDealToRow } from '@/lib/marketingMappers'
import type { MarketingDeal } from '@/types'

// Keep each upsert small enough to stay well under Supabase's request size/statement-timeout
// limits — a single request for thousands of rows either times out or fails outright, and gives
// no feedback until it does. Chunking also lets progress be reported as it goes.
const IMPORT_CHUNK_SIZE = 300

/** Upserts deals in fixed-size chunks, reporting how many rows have been processed after each
 * chunk. Runs independently of any dialog/page component — callers kick it off via
 * ImportProgressContext so it keeps going (and stays visible in the header) even if the user
 * closes the dialog or navigates to another page. */
export async function chunkedImportDeals(
  rows: Omit<MarketingDeal, 'id' | 'importedAt'>[],
  onProgress: (completed: number) => void,
): Promise<{ imported: number }> {
  let imported = 0
  for (let i = 0; i < rows.length; i += IMPORT_CHUNK_SIZE) {
    const chunk = rows.slice(i, i + IMPORT_CHUNK_SIZE)
    const { data, error } = await supabase
      .from('marketing_deals')
      .upsert(
        chunk.map((r) => marketingDealToRow(r)),
        { onConflict: 'external_id', ignoreDuplicates: false },
      )
      .select('id')
    if (error) throw new Error(error.message)
    imported += (data ?? []).length
    onProgress(Math.min(i + IMPORT_CHUNK_SIZE, rows.length))
  }
  return { imported }
}
