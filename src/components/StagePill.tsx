import { stageColor, stageLabel } from '@/lib/pipedriveStages'
import { cn } from '@/lib/utils'
import type { CrmStage } from '@/types'

/** Static color identity dot for a job's stage — same idea as TeamColorDot, so a stage is
 * recognizable by color alone in dropdowns/menus without needing the full pill treatment. */
export function StageColorDot({ stage, className }: { stage: CrmStage | undefined; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn('inline-block size-2.5 shrink-0 rounded-full ring-1 ring-black/10', className)}
      style={{ background: stageColor(stage) }}
    />
  )
}

/** Colored pill for a job's stage, matching the visual weight of CategoryPill/StatusPill — a
 * light tint of the stage's color behind text in the same color, so every stage is recognizable
 * by color everywhere it appears (table, Kanban, dropdowns). */
export function StagePill({ stage, className }: { stage: CrmStage | undefined; className?: string }) {
  const color = stageColor(stage)
  return (
    <span
      className={cn('inline-flex items-center gap-1.5 rounded-md px-2.5 py-0.5 text-xs font-medium', className)}
      style={{ background: `${color}22`, color }}
    >
      <StageColorDot stage={stage} />
      {stageLabel(stage)}
    </span>
  )
}
