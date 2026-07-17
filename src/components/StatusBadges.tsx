import { cn } from '@/lib/utils'
import type { CapacityBand, ComplianceFlag } from '@/types'
import { formatPercent } from '@/lib/formulas'

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
