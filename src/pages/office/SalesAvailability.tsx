import { useMemo } from 'react'
import { useData } from '@/context/DataContext'
import { useDataAccess } from '@/hooks/useDataAccess'
import { usePersistedState } from '@/hooks/usePersistedState'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { formatCurrency, dailyFromMonthly, weeklyFromMonthly } from '@/lib/formulas'
import { cn } from '@/lib/utils'
import {
  addDays,
  addMonths,
  eachDayInRange,
  formatDateRange,
  formatFullDate,
  formatMonthLabel,
  formatMonthRangeLabel,
  formatQuarterLabel,
  formatYearLabel,
  monthEnd,
  monthStart,
  quarterEnd,
  quarterStart,
  weekEnd,
  weekStart,
  yearEnd,
  yearStart,
} from '@/lib/schedule'
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, TrendingDown, TrendingUp } from 'lucide-react'

type ViewMode = 'day' | 'week' | 'month' | 'rolling3' | 'quarter' | 'year'

const PERIOD_ADJECTIVE: Record<ViewMode, string> = {
  day: 'Daily',
  week: 'Weekly',
  month: 'Monthly',
  rolling3: '3-Month',
  quarter: 'Quarterly',
  year: 'Yearly',
}

/** Every calendar month (as {year, month}) that overlaps [start, end] — same helper as
 * ResourceCalendar.tsx, duplicated rather than shared since this page intentionally doesn't pull
 * in any of the calendar-grid machinery it lives alongside. */
function monthsOverlapping(start: Date, end: Date): { year: number; month: number }[] {
  const months: { year: number; month: number }[] = []
  const cur = new Date(start.getFullYear(), start.getMonth(), 1)
  const last = new Date(end.getFullYear(), end.getMonth(), 1)
  while (cur <= last) {
    months.push({ year: cur.getFullYear(), month: cur.getMonth() + 1 })
    cur.setMonth(cur.getMonth() + 1)
  }
  return months
}

/** A deliberately minimal page for staff who just need to answer "how much booking room is left" —
 * James/Dee (sales) don't need the full drag-and-drop calendar grid, crew filters, or per-crew
 * rows; they need the same period paginator and Gap to Target number the Scheduler already
 * computes, without the visual noise (or the risk of accidentally dragging a phase). Everything
 * here mirrors ResourceCalendar.tsx's own period/target/gap math exactly, just without the grid. */
export function SalesAvailability() {
  const { monthlyTargets } = useData()
  const da = useDataAccess()
  const [viewMode, setViewMode] = usePersistedState<ViewMode>('qpaint:sales:viewMode', 'week')
  const [anchor, setAnchor] = usePersistedState<Date>('qpaint:sales:anchor', new Date(), {
    serialize: (d) => d.toISOString(),
    deserialize: (s) => new Date(s),
  })

  const days = useMemo(() => {
    if (viewMode === 'day') return [anchor]
    if (viewMode === 'month') return eachDayInRange(monthStart(anchor), monthEnd(anchor))
    if (viewMode === 'rolling3') return eachDayInRange(monthStart(addMonths(anchor, -1)), monthEnd(addMonths(anchor, 1)))
    if (viewMode === 'quarter') return eachDayInRange(quarterStart(anchor), quarterEnd(quarterStart(anchor)))
    if (viewMode === 'year') return eachDayInRange(yearStart(anchor), yearEnd(anchor))
    return eachDayInRange(weekStart(anchor), weekEnd(weekStart(anchor)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, anchor.getTime()])

  const windowStart = days[0]
  const windowEnd = days[days.length - 1]

  const targetInfo = useMemo(() => {
    const monthlyDollars = (year: number, month: number) => monthlyTargets.find((t) => t.year === year && t.month === month)?.targetDollars
    if (viewMode === 'day' || viewMode === 'week') {
      const monthly = monthlyDollars(anchor.getFullYear(), anchor.getMonth() + 1)
      const total = viewMode === 'day' ? dailyFromMonthly(monthly ?? 0) : weeklyFromMonthly(monthly ?? 0)
      return { total, missingMonths: monthly == null ? 1 : 0, totalMonths: 1 }
    }
    const months = monthsOverlapping(windowStart, windowEnd)
    let total = 0
    let missingMonths = 0
    for (const { year, month } of months) {
      const val = monthlyDollars(year, month)
      if (val == null) missingMonths += 1
      else total += val
    }
    return { total, missingMonths, totalMonths: months.length }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, anchor.getTime(), windowStart, windowEnd, monthlyTargets])

  const scheduledTotal = da.getScheduledDollarsInWindow(windowStart, windowEnd)
  const gap = scheduledTotal - targetInfo.total

  function goPrev() {
    if (viewMode === 'day') setAnchor((a) => addDays(a, -1))
    else if (viewMode === 'month' || viewMode === 'rolling3') setAnchor((a) => addMonths(a, -1))
    else if (viewMode === 'quarter') setAnchor((a) => addMonths(a, -3))
    else if (viewMode === 'year') setAnchor((a) => addMonths(a, -12))
    else setAnchor((a) => addDays(a, -7))
  }
  function goNext() {
    if (viewMode === 'day') setAnchor((a) => addDays(a, 1))
    else if (viewMode === 'month' || viewMode === 'rolling3') setAnchor((a) => addMonths(a, 1))
    else if (viewMode === 'quarter') setAnchor((a) => addMonths(a, 3))
    else if (viewMode === 'year') setAnchor((a) => addMonths(a, 12))
    else setAnchor((a) => addDays(a, 7))
  }
  function goToday() {
    setAnchor(new Date())
  }
  function jumpMonth(n: number) {
    setAnchor((a) => addMonths(a, n))
  }
  function jumpQuarter(n: number) {
    setAnchor((a) => addMonths(a, n * 3))
  }

  const periodLabel =
    viewMode === 'day'
      ? formatFullDate(anchor)
      : viewMode === 'month'
        ? formatMonthLabel(anchor)
        : viewMode === 'rolling3'
          ? formatMonthRangeLabel(windowStart, windowEnd)
          : viewMode === 'quarter'
            ? formatQuarterLabel(windowStart)
            : viewMode === 'year'
              ? formatYearLabel(windowStart)
              : `Week of ${formatDateRange(windowStart, windowEnd)}`

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-medium tracking-tight">Sales</h1>
          <p className="text-sm text-muted-foreground">How much booking room is left for the period — no calendar, just the number.</p>
        </div>
        <div className="flex gap-1.5 rounded-lg border border-border bg-card p-1">
          <Button size="sm" variant={viewMode === 'day' ? 'secondary' : 'ghost'} onClick={() => setViewMode('day')}>Day</Button>
          <Button size="sm" variant={viewMode === 'week' ? 'secondary' : 'ghost'} onClick={() => setViewMode('week')}>Week</Button>
          <Button size="sm" variant={viewMode === 'month' ? 'secondary' : 'ghost'} onClick={() => setViewMode('month')}>Month</Button>
          <Button size="sm" variant={viewMode === 'rolling3' ? 'secondary' : 'ghost'} onClick={() => setViewMode('rolling3')}>3 Months</Button>
          <Button size="sm" variant={viewMode === 'quarter' ? 'secondary' : 'ghost'} onClick={() => setViewMode('quarter')}>Quarter</Button>
          <Button size="sm" variant={viewMode === 'year' ? 'secondary' : 'ghost'} onClick={() => setViewMode('year')}>Year</Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="icon-sm" variant="outline" onClick={goPrev} aria-label="Previous period"><ChevronLeft /></Button>
        <Button size="sm" variant="outline" onClick={goToday}>Today</Button>
        <Button size="icon-sm" variant="outline" onClick={goNext} aria-label="Next period"><ChevronRight /></Button>
        <span className="ml-1 text-base font-medium">{periodLabel}</span>

        <div className="ml-2 flex items-center gap-1 rounded-md border border-border p-0.5">
          <Button size="icon-sm" variant="ghost" onClick={() => jumpMonth(-1)} aria-label="Back a month" title="Back a month">
            <ChevronsLeft className="size-3.5" />
          </Button>
          <span className="px-0.5 text-[11px] text-muted-foreground">Month</span>
          <Button size="icon-sm" variant="ghost" onClick={() => jumpMonth(1)} aria-label="Forward a month" title="Forward a month">
            <ChevronsRight className="size-3.5" />
          </Button>
        </div>
        <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
          <Button size="icon-sm" variant="ghost" onClick={() => jumpQuarter(-1)} aria-label="Back a quarter" title="Back a quarter">
            <ChevronsLeft className="size-3.5" />
          </Button>
          <span className="px-0.5 text-[11px] text-muted-foreground">Quarter</span>
          <Button size="icon-sm" variant="ghost" onClick={() => jumpQuarter(1)} aria-label="Forward a quarter" title="Forward a quarter">
            <ChevronsRight className="size-3.5" />
          </Button>
        </div>
      </div>

      <Card className={cn('mx-auto max-w-md gap-3 p-6 text-center transition hover:shadow-md', gap < 0 ? 'bg-warning-bg' : 'bg-success-bg')}>
        <div className="flex items-center justify-center gap-2">
          <span
            className={cn(
              'flex size-10 shrink-0 items-center justify-center rounded-full',
              gap < 0 ? 'bg-warning/15 text-warning' : 'bg-success/15 text-success',
            )}
          >
            {gap < 0 ? <TrendingDown className="size-5" /> : <TrendingUp className="size-5" />}
          </span>
          <p className={cn('text-sm font-medium', gap < 0 ? 'text-warning' : 'text-success')}>Gap to target</p>
        </div>
        <p className={cn('text-4xl font-semibold tracking-tight', gap < 0 ? 'text-warning' : 'text-success')}>{formatCurrency(gap)}</p>
        <p className="text-sm text-muted-foreground">
          {gap < 0
            ? `${formatCurrency(Math.abs(gap))} of ${PERIOD_ADJECTIVE[viewMode].toLowerCase()} target still needs booking`
            : `${formatCurrency(gap)} ahead of ${PERIOD_ADJECTIVE[viewMode].toLowerCase()} target — booked out`}
        </p>
        {targetInfo.missingMonths > 0 && (
          <p className="text-xs text-muted-foreground">
            {targetInfo.totalMonths === 1 ? 'No target set for this month' : `No target set for ${targetInfo.missingMonths} of ${targetInfo.totalMonths} months`}
          </p>
        )}
      </Card>
    </div>
  )
}
