// A real, saturated categorical palette for the Marketing dashboard — charts, source comparison
// chips, and KPI card accents all draw from the same list so a given referral source (or KPI)
// reads as the same color everywhere on the page. Kept local to the Marketing module rather than
// touching the app-wide --chart-1..5 tokens (deliberately grayscale for the rest of the app).
const PALETTE = [
  '#2563eb', // blue
  '#16a34a', // green
  '#d97706', // amber
  '#9333ea', // purple
  '#dc2626', // red
  '#0891b2', // cyan
  '#db2777', // pink
  '#65a30d', // lime
  '#4f46e5', // indigo
  '#ea580c', // orange
] as const

export function colorForIndex(index: number): string {
  return PALETTE[index % PALETTE.length]
}

/** Stable color per referral source, based on its position in a shared, sorted source list — so a
 * source keeps the same color across the comparison chart, the chip picker, and the table, even as
 * the set of visible/selected sources changes. */
export function colorForReferralSource(source: string, allSources: string[]): string {
  const index = allSources.indexOf(source)
  return colorForIndex(index < 0 ? 0 : index)
}

// KPI tiles get fixed, meaningful colors rather than palette-by-index, so "Jobs Won" is always
// green and "Cost Per Lead" is always the same warm tone regardless of dashboard state.
export const KPI_COLORS = {
  leads: '#2563eb',
  quotes: '#9333ea',
  quoteValue: '#0891b2',
  jobsWon: '#16a34a',
  jobsWonValue: '#65a30d',
  conversion: '#d97706',
  cost: '#dc2626',
  avgValue: '#4f46e5',
  roasGood: '#16a34a',
  roasBad: '#dc2626',
} as const
