import { api } from '@/lib/apiClient'
import type { MarketingDeal } from '@/types'

// Keep each request small enough to report progress as it goes — the Netlify Function itself has
// no PostgREST-style row cap, but a single request for thousands of rows still gives no feedback
// until it either finishes or times out.
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
    const { imported: chunkImported } = await api.post<{ imported: number }>('/api/marketing-deals', { deals: chunk })
    imported += chunkImported
    onProgress(Math.min(i + IMPORT_CHUNK_SIZE, rows.length))
  }
  return { imported }
}
