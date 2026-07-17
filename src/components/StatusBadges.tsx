import { cn } from '@/lib/utils'
import type { CapacityBand, ComplianceFlag, JobCategory } from '@/types'
import { formatPercent } from '@/lib/formulas'
import { JOB_CATEGORY_ICONS } from '@/lib/jobCategoryIcons'

const BAND_STYLES: Record<CapacityBand, string> = {
  green: 'bg-success-bg text-success',
  orange: 'bg-warning-bg text-warning',
  red: 'bg-danger-bg text-danger',
}

/** The one consistent capacity traffic-light — green <=100, orange 101-115, red >=115. Display only. */
export function CapacityPill({ percent, band, suffix }: { percent: number; band: CapacityBand; suffix?: string }) {
  return (
    <span className={cn('inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-medium', BAND_STYLES[band])}>
      {formatPercent(percent)}
      {suffix ? ` ${suffix}` : ''}
    </span>
  )
}

/** Under-utilization is a distinct concern from over-capacity — always blue/informational, never red/orange. */
export function UnderUtilizedPill() {
  return (
    <span className="inline-flex items-center rounded-md bg-info-bg px-2.5 py-0.5 text-xs font-medium text-info">
      Under-utilized
    </span>
  )
}

const COMPLIANCE_STYLES: Record<ComplianceFlag, { label: string; className: string }> = {
  green: { label: 'Compliant', className: 'bg-success-bg text-success' },
  amber: { label: 'Expiring soon', className: 'bg-warning-bg text-warning' },
  red: { label: 'Expired', className: 'bg-danger-bg text-danger' },
  grey: { label: 'Data missing', className: 'bg-muted text-muted-foreground' },
}

/** Compliance is its own 4-state indicator — a different concern from capacity, never forced into the same bands. */
export function CompliancePill({ flag }: { flag: ComplianceFlag }) {
  const style = COMPLIANCE_STYLES[flag]
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-md px-2.5 py-0.5 text-xs font-medium', style.className)}>
      <span
        className={cn('h-1.5 w-1.5 rounded-full', {
          'bg-success': flag === 'green',
          'bg-warning': flag === 'amber',
          'bg-danger': flag === 'red',
          'bg-muted-foreground': flag === 'grey',
        })}
      />
      {style.label}
    </span>
  )
}

const SCHEDULE_BLOCK_STATUS_STYLES: Record<string, string> = {
  Unscheduled: 'bg-muted text-muted-foreground',
  Scheduled: 'bg-info-bg text-info',
  'In Production': 'bg-warning-bg text-warning',
  Overdue: 'bg-danger-bg text-danger',
  Completed: 'bg-success-bg text-success',
}

export function StatusPill({ status }: { status: string }) {
  return (
    <span className={cn('inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-medium', SCHEDULE_BLOCK_STATUS_STYLES[status] ?? 'bg-muted')}>
      {status}
    </span>
  )
}

/** Shared with the Jobs List row-highlight tint — every job status maps to the same color everywhere. */
export const JOB_STATUS_STYLES = SCHEDULE_BLOCK_STATUS_STYLES

/** Subtle left-border + tint for table rows — same status colors as StatusPill, just lower-contrast. */
export const JOB_ROW_STATUS_STYLES: Record<string, string> = {
  Unscheduled: 'border-l-2 border-l-transparent',
  Scheduled: 'border-l-2 border-l-info bg-info-bg/50 hover:brightness-[0.97]',
  'In Production': 'border-l-2 border-l-warning bg-warning-bg/50 hover:brightness-[0.97]',
  Overdue: 'border-l-2 border-l-danger bg-danger-bg/50 hover:brightness-[0.97]',
  Completed: 'border-l-2 border-l-success bg-success-bg/50 hover:brightness-[0.97]',
}

const JOB_CATEGORY_STYLES: Record<JobCategory, string> = {
  Residential: 'bg-success-bg text-success',
  Corporate: 'bg-info-bg text-info',
  Commercial: 'bg-warning-bg text-warning',
  Government: 'bg-muted text-muted-foreground',
}

export function CategoryPill({ category }: { category: JobCategory }) {
  const Icon = JOB_CATEGORY_ICONS[category]
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-md px-2.5 py-0.5 text-xs font-medium', JOB_CATEGORY_STYLES[category])}>
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      {category}
    </span>
  )
}
