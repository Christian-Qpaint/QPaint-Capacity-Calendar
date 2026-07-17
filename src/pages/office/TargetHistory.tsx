import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { useData } from '@/context/DataContext'
import { useCurrentUser } from '@/context/AuthContext'
import { useDataAccess } from '@/hooks/useDataAccess'
import { canManageTargets } from '@/lib/permissions'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { formatCurrency } from '@/lib/formulas'
import { monthEnd, monthStart } from '@/lib/schedule'
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react'

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const QUARTERS = [[1, 2, 3], [4, 5, 6], [7, 8, 9], [10, 11, 12]]

type AttainmentBand = 'success' | 'warning' | 'danger' | 'muted'

/** Target-attainment traffic light — exceeding target is good (unlike the Capacity Board's
 * over-capacity bands, where exceeding 100% is a risk signal). Display-only convenience for this
 * history view, not one of the 10 locked formulas. */
function attainmentBand(actual: number, target: number): AttainmentBand {
  if (target <= 0) return actual > 0 ? 'success' : 'muted'
  const pct = (actual / target) * 100
  if (pct >= 100) return 'success'
  if (pct >= 80) return 'warning'
  return 'danger'
}

const BAND_BAR_CLASS: Record<AttainmentBand, string> = {
  success: 'bg-success-fill',
  warning: 'bg-warning-fill',
  danger: 'bg-danger-fill',
  muted: 'bg-muted-foreground/40',
}
const BAND_TEXT_CLASS: Record<AttainmentBand, string> = {
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  muted: 'text-muted-foreground',
}

interface MonthFigure {
  month: number // 1-12
  target: number
  actual: number
  captured: boolean
  capturedAt?: string
  isFuture: boolean
}

export function TargetHistory() {
  const { monthlyTargets, monthlySnapshots, takeMonthlySnapshot } = useData()
  const currentUser = useCurrentUser()
  const da = useDataAccess()
  const canManage = canManageTargets(currentUser.role)

  const [year, setYear] = useState(() => new Date().getFullYear())
  const [grouping, setGrouping] = useState<'monthly' | 'quarterly'>('monthly')
  const [savingMonth, setSavingMonth] = useState<number | null>(null)

  const today = new Date()
  const currentMonthStart = new Date(today.getFullYear(), today.getMonth(), 1)

  const monthFigures: MonthFigure[] = useMemo(() => {
    const figures: MonthFigure[] = []
    for (let month = 1; month <= 12; month++) {
      const snapshot = monthlySnapshots.find((s) => s.year === year && s.month === month)
      const targetRow = monthlyTargets.find((t) => t.year === year && t.month === month)
      const ws = monthStart(new Date(year, month - 1, 1))
      const isFuture = ws > currentMonthStart

      if (snapshot) {
        figures.push({ month, target: snapshot.targetDollars, actual: snapshot.actualDollars, captured: true, capturedAt: snapshot.capturedAt, isFuture: false })
      } else if (isFuture) {
        figures.push({ month, target: targetRow?.targetDollars ?? 0, actual: 0, captured: false, isFuture: true })
      } else {
        const actual = da.getScheduledDollarsInWindow(ws, monthEnd(ws))
        figures.push({ month, target: targetRow?.targetDollars ?? 0, actual, captured: false, isFuture: false })
      }
    }
    return figures
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthlySnapshots, monthlyTargets, year])

  const rows = useMemo(
    () =>
      grouping === 'monthly'
        ? monthFigures.map((f) => ({ label: MONTH_NAMES[f.month - 1], figures: [f] }))
        : QUARTERS.map((group, qi) => ({ label: `Q${qi + 1}`, figures: group.map((mo) => monthFigures[mo - 1]) })),
    [grouping, monthFigures],
  )

  async function handleSnapshot(month: number) {
    setSavingMonth(month)
    try {
      const ws = monthStart(new Date(year, month - 1, 1))
      const actual = da.getScheduledDollarsInWindow(ws, monthEnd(ws))
      await takeMonthlySnapshot(year, month, actual)
      toast.success(`Captured snapshot for ${MONTH_NAMES[month - 1]} ${year}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to capture snapshot')
    } finally {
      setSavingMonth(null)
    }
  }

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" render={<Link to="/capacity" />} className="-ml-2">
        <ArrowLeft /> Back to Capacity Board
      </Button>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" onClick={() => setYear((y) => y - 1)} aria-label="Previous year">
            <ChevronLeft />
          </Button>
          <h1 className="text-lg font-medium">{year}</h1>
          <Button variant="ghost" size="icon-sm" onClick={() => setYear((y) => y + 1)} aria-label="Next year">
            <ChevronRight />
          </Button>
        </div>
        <div className="flex gap-1.5 rounded-md border border-border bg-card p-1">
          <Button size="sm" variant={grouping === 'monthly' ? 'secondary' : 'ghost'} onClick={() => setGrouping('monthly')}>
            Monthly
          </Button>
          <Button size="sm" variant={grouping === 'quarterly' ? 'secondary' : 'ghost'} onClick={() => setGrouping('quarterly')}>
            Quarterly
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        {rows.map((row) => {
          const target = row.figures.reduce((s, f) => s + f.target, 0)
          const actual = row.figures.reduce((s, f) => s + f.actual, 0)
          const band = attainmentBand(actual, target)
          const maxVal = Math.max(target, actual, 1)
          const isFutureRow = row.figures.every((f) => f.isFuture)
          const allCaptured = row.figures.every((f) => f.captured)
          const singleMonth = row.figures.length === 1 ? row.figures[0] : null

          return (
            <Card key={row.label} className="gap-2 p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm font-medium">{row.label}</span>
                <span className="text-xs text-muted-foreground">
                  {isFutureRow
                    ? 'Upcoming'
                    : allCaptured
                      ? `Captured${
                          singleMonth?.capturedAt
                            ? ' ' + new Date(singleMonth.capturedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
                            : ''
                        }`
                      : 'Live — not yet captured'}
                </span>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-xs">
                  <span className="w-14 shrink-0 text-muted-foreground">Target</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <div className="h-full bg-muted-foreground/40" style={{ width: `${Math.min(100, (target / maxVal) * 100)}%` }} />
                  </div>
                  <span className="w-24 shrink-0 text-right font-medium text-foreground">{formatCurrency(target)}</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="w-14 shrink-0 text-muted-foreground">Actual</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <div className={`h-full ${BAND_BAR_CLASS[band]}`} style={{ width: `${Math.min(100, (actual / maxVal) * 100)}%` }} />
                  </div>
                  <span className="w-24 shrink-0 text-right font-medium text-foreground">{formatCurrency(actual)}</span>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className={`text-xs font-medium ${BAND_TEXT_CLASS[band]}`}>
                  {target > 0 ? `${Math.round((actual / target) * 100)}% of target` : isFutureRow ? 'No data yet' : 'No target set'}
                </span>
                {grouping === 'monthly' && canManage && singleMonth && !singleMonth.isFuture && !singleMonth.captured && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={savingMonth === singleMonth.month}
                    onClick={() => handleSnapshot(singleMonth.month)}
                  >
                    {savingMonth === singleMonth.month ? 'Capturing…' : 'Take snapshot'}
                  </Button>
                )}
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
