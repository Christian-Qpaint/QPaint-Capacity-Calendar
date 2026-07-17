import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useData } from '@/context/DataContext'
import { useCurrentUser } from '@/context/AuthContext'
import { useDataAccess } from '@/hooks/useDataAccess'
import { canManageTargets } from '@/lib/permissions'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CapacityPill, UnderUtilizedPill } from '@/components/StatusBadges'
import { TargetConfigDialog } from '@/components/TargetConfigDialog'
import { formatCurrency, weeklyFromMonthly } from '@/lib/formulas'
import {
  formatDateRange,
  formatMonthLabel,
  monthEnd,
  monthStart,
  weekEnd,
  weekStart,
} from '@/lib/schedule'
import { History, Settings } from 'lucide-react'

export function CapacityBoard() {
  const { teams, contractors, monthlyTargets } = useData()
  const currentUser = useCurrentUser()
  const da = useDataAccess()
  const [isMonthly, setIsMonthly] = useState(false)
  const [anchor] = useState(() => new Date())
  const [targetDialogOpen, setTargetDialogOpen] = useState(false)

  const windowStart = isMonthly ? monthStart(anchor) : weekStart(anchor)
  const windowEnd = isMonthly ? monthEnd(anchor) : weekEnd(weekStart(anchor))

  const qpaintTeams = teams.filter((t) => t.type === 'QPaint')

  const teamRows = useMemo(
    () => qpaintTeams.map((team) => da.getQPaintTeamRow(team, windowStart, windowEnd, isMonthly)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [qpaintTeams, windowStart.getTime(), windowEnd.getTime(), isMonthly],
  )
  const contractorRows = useMemo(
    () => contractors.map((c) => da.getContractorRow(c, windowStart, windowEnd, isMonthly)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [contractors, windowStart.getTime(), windowEnd.getTime(), isMonthly],
  )

  const scheduledTotal = da.getScheduledDollarsInWindow(windowStart, windowEnd)

  const monthlyTargetRow = monthlyTargets.find((t) => t.year === anchor.getFullYear() && t.month === anchor.getMonth() + 1)
  const monthlyTargetDollars = monthlyTargetRow?.targetDollars ?? 0
  const targetTotal = isMonthly ? monthlyTargetDollars : weeklyFromMonthly(monthlyTargetDollars)
  const gap = scheduledTotal - targetTotal

  const canManage = canManageTargets(currentUser.role)

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-medium">
          {isMonthly ? formatMonthLabel(windowStart) : `Week of ${formatDateRange(windowStart, windowEnd)}`}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1.5 rounded-md border border-border bg-card p-1">
            <Button size="sm" variant={!isMonthly ? 'secondary' : 'ghost'} onClick={() => setIsMonthly(false)}>
              Weekly
            </Button>
            <Button size="sm" variant={isMonthly ? 'secondary' : 'ghost'} onClick={() => setIsMonthly(true)}>
              Monthly
            </Button>
          </div>
          <Button size="sm" variant="outline" render={<Link to="/capacity/history" />}>
            <History /> History
          </Button>
          {canManage && (
            <Button size="sm" variant="outline" onClick={() => setTargetDialogOpen(true)}>
              <Settings /> Configure targets
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card className="gap-1 p-4">
          <p className="text-xs text-muted-foreground">{isMonthly ? 'Monthly target' : 'Weekly target'}</p>
          <p className="text-2xl font-medium">{formatCurrency(targetTotal)}</p>
          {!monthlyTargetRow && (
            <p className="text-xs text-muted-foreground">No target set for this month</p>
          )}
        </Card>
        <Card className="gap-1 p-4">
          <p className="text-xs text-muted-foreground">Scheduled this {isMonthly ? 'month' : 'week'}</p>
          <p className="text-2xl font-medium">{formatCurrency(scheduledTotal)}</p>
        </Card>
        <Card className={`gap-1 p-4 ${gap < 0 ? 'bg-warning-bg' : 'bg-success-bg'}`}>
          <p className={`text-xs ${gap < 0 ? 'text-warning' : 'text-success'}`}>Gap to target</p>
          <p className={`text-2xl font-medium ${gap < 0 ? 'text-warning' : 'text-success'}`}>{formatCurrency(gap)}</p>
        </Card>
      </div>

      <TargetConfigDialog open={targetDialogOpen} onOpenChange={setTargetDialogOpen} />

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-medium">QPaint Teams</h2>
          <p className="text-xs text-muted-foreground">
            {isMonthly ? 'Monthly capacity = weekly capacity × ~4.33 weeks' : 'Weekly capacity = headcount × standard hours/week'}
          </p>
        </div>
        <div className="space-y-2">
          {teamRows.map((row) => (
            <Card key={row.team.id} className="gap-2 p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm font-medium">{row.team.name}</span>
                <span className="text-xs text-muted-foreground">
                  {isMonthly ? '~' : ''}
                  {Math.round(row.capacityHours)} hrs/{isMonthly ? 'mo' : 'wk'} capacity
                </span>
              </div>
              <div className="flex items-center gap-3">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full ${
                      row.band === 'red' ? 'bg-danger-fill' : row.band === 'orange' ? 'bg-warning-fill' : 'bg-success-fill'
                    }`}
                    style={{ width: `${Math.min(100, row.usedPercent)}%` }}
                  />
                </div>
                <CapacityPill percent={row.usedPercent} band={row.band} />
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {Math.round(row.scheduledHours)} hrs · {formatCurrency(row.scheduledDollars)} scheduled
                </span>
                {row.underUtilized && <UnderUtilizedPill />}
              </div>
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-medium">Contractors</h2>
          <p className="text-xs text-muted-foreground">
            {isMonthly
              ? 'Monthly Safety Target = self-reported capacity × 80%'
              : 'Weekly target = monthly Safety Target ÷ ~4.33'}
          </p>
        </div>
        <div className="space-y-2">
          {contractorRows.map((row) => (
            <Card key={row.contractor.id} className="gap-2 p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm font-medium">{row.contractor.name}</span>
                <span className="text-xs text-muted-foreground">{row.activeTeams} team{row.activeTeams === 1 ? '' : 's'} active</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full ${
                      row.underUtilized
                        ? 'bg-info-fill'
                        : row.band === 'red'
                          ? 'bg-danger-fill'
                          : row.band === 'orange'
                            ? 'bg-warning-fill'
                            : 'bg-success-fill'
                    }`}
                    style={{ width: `${Math.min(100, row.usedPercent)}%` }}
                  />
                </div>
                {row.underUtilized ? <UnderUtilizedPill /> : <CapacityPill percent={row.usedPercent} band={row.band} />}
              </div>
              <div className="text-xs text-muted-foreground">
                {formatCurrency(row.scheduledDollars)} scheduled · {row.underUtilized ? `${Math.round(row.usedPercent)}% of ` : 'target '}
                {formatCurrency(row.targetDollars)} {isMonthly ? 'safety target/mo' : 'target/wk'}
              </div>
            </Card>
          ))}
        </div>
      </section>
    </div>
  )
}
