import { getTeamColors } from '@/lib/teamColors'
import { cn } from '@/lib/utils'

/** Static, non-interactive color identity dot — shown immediately to the left of a team's name
 * everywhere it appears (tables, dropdowns, cards, detail pages) so a crew is recognizable by
 * color alone. For the interactive equivalent that lets someone change the color, see
 * ColorSwatchInput. */
export function TeamColorDot({ team, className }: { team: { id: string; color?: string }; className?: string }) {
  const { bg } = getTeamColors(team)
  return (
    <span
      aria-hidden="true"
      className={cn('inline-block size-2.5 shrink-0 rounded-full ring-1 ring-black/10', className)}
      style={{ background: bg }}
    />
  )
}
