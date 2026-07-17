import type { Job } from '@/types'

/** The deal's own Pipedrive title when synced (already Quote-ID-prefixed), falling back to
 * "{quoteId} - {address}" for jobs synced before that column existed. */
export function jobDisplayName(job: Job): string {
  return job.pipedriveDealTitle || `${job.pipedriveDealId} - ${job.address}`
}
