import { useMemo, useRef, useState } from 'react'
import { useData } from '@/context/DataContext'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { AddEditPhaseDialog, type PhaseDialogState } from '@/components/AddEditPhaseDialog'
import { ColorSwatchInput } from '@/components/ColorSwatchInput'
import { TeamColorDot } from '@/components/TeamColorDot'
import { getTeamColors, getTeamGradient } from '@/lib/teamColors'
import {
  addDays,
  addMonths,
  eachDayInRange,
  formatDateRange,
  formatFullDate,
  formatMonthLabel,
  monthEnd,
  monthStart,
  runsIntoWeekend,
  toDate,
  weekEnd,
  weekStart,
} from '@/lib/schedule'
import { ChevronLeft, ChevronRight, ListFilter, TriangleAlert } from 'lucide-react'
import type { ScheduleBlock } from '@/types'

type ViewMode = 'day' | 'week' | 'month'

const ROW_HEIGHT = 56
const HEADER_HEIGHT = 56
const LABEL_COL_WIDTH = 220
const DAY_COL_WIDTH: Record<ViewMode, number> = { day: 480, week: 128, month: 60 }

function toIso(d: Date): string {
  // Format local Y-M-D directly — toISOString() converts to UTC first, which shifts the date
  // by a day in any timezone ahead of UTC.
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

interface Row {
  key: string
  label: string
  indent: boolean
  teamId: string | null
  sectionHeader?: boolean
}

export function ResourceCalendar() {
  const { teams, contractors, scheduleBlocks, jobs, updateTeam } = useData()
  const [viewMode, setViewMode] = useState<ViewMode>('week')
  const [anchor, setAnchor] = useState(() => new Date())
  // 'all' means every team; once the user touches a checkbox it becomes an explicit id list.
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[] | 'all'>('all')
  const [dialogState, setDialogState] = useState<PhaseDialogState>({ open: false, block: null })

  const today = new Date()
  const todayIsoStr = toIso(today)

  const effectiveSelected = selectedTeamIds === 'all' ? teams.map((t) => t.id) : selectedTeamIds

  function toggleTeam(teamId: string) {
    setSelectedTeamIds((prev) => {
      const base = prev === 'all' ? teams.map((t) => t.id) : prev
      return base.includes(teamId) ? base.filter((id) => id !== teamId) : [...base, teamId]
    })
  }

  const days = useMemo(() => {
    if (viewMode === 'day') return [anchor]
    if (viewMode === 'month') return eachDayInRange(monthStart(anchor), monthEnd(anchor))
    return eachDayInRange(weekStart(anchor), weekEnd(weekStart(anchor)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, anchor.getTime()])

  const windowStart = days[0]
  const windowEnd = days[days.length - 1]
  // End-of-day bound for block-overlap comparisons — windowEnd itself is that day's local midnight,
  // which would wrongly exclude blocks starting/ending later that same day (most visible in Day view,
  // where windowStart === windowEnd exactly).
  const windowEndOfDay = new Date(windowEnd.getFullYear(), windowEnd.getMonth(), windowEnd.getDate(), 23, 59, 59, 999)

  const rows = useMemo<Row[]>(() => {
    const result: Row[] = []
    const qpaintTeams = teams.filter((t) => t.type === 'QPaint' && effectiveSelected.includes(t.id))
    if (qpaintTeams.length > 0) {
      result.push({ key: 'section-qpaint', label: 'QPaint Teams', indent: false, teamId: null, sectionHeader: true })
      for (const t of qpaintTeams) result.push({ key: t.id, label: t.name, indent: true, teamId: t.id })
    }

    const contractorRows: Row[] = []
    for (const c of contractors) {
      const cTeams = teams.filter((t) => t.contractorId === c.id && effectiveSelected.includes(t.id))
      if (cTeams.length === 0) continue
      const allContractorTeams = teams.filter((t) => t.contractorId === c.id)
      if (allContractorTeams.length > 1) {
        contractorRows.push({ key: c.id, label: c.nickname || c.name, indent: false, teamId: null })
        for (const t of cTeams) contractorRows.push({ key: t.id, label: t.name, indent: true, teamId: t.id })
      } else {
        contractorRows.push({ key: cTeams[0].id, label: c.nickname || c.name, indent: false, teamId: cTeams[0].id })
      }
    }
    if (contractorRows.length > 0) {
      result.push({ key: 'section-contractors', label: 'Contractors', indent: false, teamId: null, sectionHeader: true })
      result.push(...contractorRows)
    }
    return result
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teams, contractors, selectedTeamIds])

  function dayColumn(d: Date): number {
    const offset = Math.round((d.getTime() - windowStart.getTime()) / 86400000)
    return offset + 1
  }

  // Frozen header row + label column are separate elements (not CSS `position: sticky` inside the
  // grid) mirrored via scroll position — sticky-in-grid with both a frozen row AND frozen column
  // simultaneously has real rendering glitches in Chromium (stale content bleeding over the frozen
  // panes on scroll). This is the standard, reliable "frozen panes" technique instead.
  const bodyScrollRef = useRef<HTMLDivElement>(null)
  const headerScrollRef = useRef<HTMLDivElement>(null)
  const labelScrollRef = useRef<HTMLDivElement>(null)

  function handleBodyScroll() {
    const body = bodyScrollRef.current
    if (!body) return
    if (headerScrollRef.current) headerScrollRef.current.scrollLeft = body.scrollLeft
    if (labelScrollRef.current) labelScrollRef.current.scrollTop = body.scrollTop
  }

  function goPrev() {
    if (viewMode === 'day') setAnchor((a) => addDays(a, -1))
    else if (viewMode === 'month') setAnchor((a) => addMonths(a, -1))
    else setAnchor((a) => addDays(a, -7))
  }
  function goNext() {
    if (viewMode === 'day') setAnchor((a) => addDays(a, 1))
    else if (viewMode === 'month') setAnchor((a) => addMonths(a, 1))
    else setAnchor((a) => addDays(a, 7))
  }
  function goToday() {
    setAnchor(new Date())
  }

  function openCreate(teamId: string, date: Date) {
    setDialogState({ open: true, block: null, defaultTeamId: teamId, defaultDate: toIso(date) })
  }
  function openEdit(block: ScheduleBlock) {
    setDialogState({ open: true, block })
  }

  const periodLabel =
    viewMode === 'day' ? formatFullDate(anchor) : viewMode === 'month' ? formatMonthLabel(anchor) : `Week of ${formatDateRange(windowStart, windowEnd)}`

  const selectedCount = effectiveSelected.length
  const totalCount = teams.length
  const colWidth = DAY_COL_WIDTH[viewMode]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-medium tracking-tight">Resource Schedule Calendar</h1>
        <div className="flex gap-1.5 rounded-lg border border-border bg-card p-1">
          <Button size="sm" variant={viewMode === 'day' ? 'secondary' : 'ghost'} onClick={() => setViewMode('day')}>Day</Button>
          <Button size="sm" variant={viewMode === 'week' ? 'secondary' : 'ghost'} onClick={() => setViewMode('week')}>Week</Button>
          <Button size="sm" variant={viewMode === 'month' ? 'secondary' : 'ghost'} onClick={() => setViewMode('month')}>Month</Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button size="icon-sm" variant="outline" onClick={goPrev} aria-label="Previous period"><ChevronLeft /></Button>
          <Button size="sm" variant="outline" onClick={goToday}>Today</Button>
          <Button size="icon-sm" variant="outline" onClick={goNext} aria-label="Next period"><ChevronRight /></Button>
          <span className="ml-1 text-base font-medium">{periodLabel}</span>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button size="sm" variant="outline">
                <ListFilter /> Crews ({selectedCount}/{totalCount})
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="w-64">
            <div className="flex items-center justify-between px-1.5 py-1">
              <button className="text-xs text-info" onClick={() => setSelectedTeamIds('all')}>Select all</button>
              <button className="text-xs text-info" onClick={() => setSelectedTeamIds([])}>Clear all</button>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>QPaint Teams</DropdownMenuLabel>
              {teams.filter((t) => t.type === 'QPaint').map((t) => (
                <DropdownMenuCheckboxItem
                  key={t.id}
                  checked={effectiveSelected.includes(t.id)}
                  onCheckedChange={() => toggleTeam(t.id)}
                >
                  <TeamColorDot team={t} className="mr-1.5" />
                  {t.name}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>Contractors</DropdownMenuLabel>
              {contractors.map((c) => {
                const cTeams = teams.filter((t) => t.contractorId === c.id)
                return (
                  <div key={c.id}>
                    {cTeams.map((t) => (
                      <DropdownMenuCheckboxItem
                        key={t.id}
                        checked={effectiveSelected.includes(t.id)}
                        onCheckedChange={() => toggleTeam(t.id)}
                      >
                        <TeamColorDot team={t} className="mr-1.5" />
                        {cTeams.length > 1 ? `${c.nickname || c.name} — ${t.name}` : c.nickname || c.name}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </div>
                )
              })}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="relative overflow-hidden rounded-xl border border-border bg-card shadow-sm" style={{ height: '70vh' }}>
        {/* corner — sits above both frozen panes */}
        <div
          style={{ width: LABEL_COL_WIDTH, height: HEADER_HEIGHT }}
          className="absolute top-0 left-0 z-30 flex items-end border-r border-b border-border bg-card p-4 pb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase"
        >
          Team / Contractor
        </div>

        {/* frozen header row (dates) — horizontal position mirrors the body's scrollLeft via JS */}
        <div
          ref={headerScrollRef}
          style={{ left: LABEL_COL_WIDTH, right: 0, height: HEADER_HEIGHT }}
          className="absolute top-0 z-20 overflow-hidden border-b border-border bg-card"
        >
          <div className="flex" style={{ width: days.length * colWidth }}>
            {days.map((d, i) => {
              const isToday = toIso(d) === todayIsoStr
              return (
                <div key={i} style={{ width: colWidth }} className="flex flex-col items-center justify-end gap-0.5 pb-2">
                  <span className="text-[11px] text-muted-foreground">{d.toLocaleDateString('en-AU', { weekday: 'short' })}</span>
                  <span
                    className={
                      isToday
                        ? 'flex size-6 items-center justify-center rounded-full bg-info text-xs font-semibold text-white'
                        : 'text-sm font-medium'
                    }
                  >
                    {d.getDate()}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* frozen label column — vertical position mirrors the body's scrollTop via JS */}
        <div
          ref={labelScrollRef}
          style={{ top: HEADER_HEIGHT, bottom: 0, width: LABEL_COL_WIDTH }}
          className="absolute left-0 z-20 overflow-hidden border-r border-border bg-card"
        >
          {rows.map((row) => (
            <div
              key={`label-${row.key}`}
              style={{ height: ROW_HEIGHT }}
              className={`flex items-center gap-2 border-t border-border/60 pr-2 pl-4 text-sm ${
                row.sectionHeader
                  ? 'border-t-2 border-t-foreground/20 text-xs font-semibold tracking-wide text-muted-foreground uppercase'
                  : row.indent
                    ? 'pl-8 text-muted-foreground'
                    : 'font-medium'
              }`}
            >
              {!row.sectionHeader && row.teamId && (
                <ColorSwatchInput
                  value={getTeamColors(teams.find((t) => t.id === row.teamId)!).bg}
                  onChange={(v) => updateTeam(row.teamId!, { color: v })}
                  title="Change crew color"
                />
              )}
              <span className="truncate">{row.label}</span>
            </div>
          ))}
        </div>

        {/* scrollable body — the only real scrollbar; header + label panes mirror this via JS */}
        <div
          ref={bodyScrollRef}
          onScroll={handleBodyScroll}
          style={{ top: HEADER_HEIGHT, left: LABEL_COL_WIDTH, right: 0, bottom: 0 }}
          className="absolute overflow-auto"
        >
          <div
            className="relative grid"
            style={{
              gridTemplateColumns: `repeat(${days.length}, ${colWidth}px)`,
              gridAutoRows: `${ROW_HEIGHT}px`,
              width: days.length * colWidth,
              minHeight: rows.length * ROW_HEIGHT,
            }}
          >
            {/* column backgrounds: weekend tint + today highlight, full height */}
            {days.map((d, i) => {
              const isWeekend = d.getDay() === 0 || d.getDay() === 6
              const isToday = toIso(d) === todayIsoStr
              return (
                <div
                  key={i}
                  style={{ gridColumn: i + 1, gridRow: `1 / ${rows.length + 1}` }}
                  className={`border-l border-border/60 ${isToday ? 'bg-info-bg/70' : isWeekend ? 'bg-muted/50' : ''}`}
                />
              )
            })}

            {/* row separators across the day columns (grid lines) */}
            {rows.map((row, rowIdx) =>
              days.map((_, i) => (
                <div
                  key={`gridline-${row.key}-${i}`}
                  style={{ gridColumn: i + 1, gridRow: rowIdx + 1 }}
                  className="border-t border-border/60"
                />
              )),
            )}

            {rows.length === 0 && (
              <div style={{ gridColumn: `1 / ${days.length + 1}`, gridRow: 1 }} className="py-6 text-center text-sm text-muted-foreground">
                No crews selected — use the Crews filter above.
              </div>
            )}

            {/* click-to-add targets */}
            {rows.flatMap((row, rowIdx) => {
              if (!row.teamId) return []
              return days.map((d) => (
                <button
                  key={`${row.key}-${toIso(d)}`}
                  type="button"
                  style={{ gridColumn: dayColumn(d), gridRow: rowIdx + 1 }}
                  className="h-full w-full cursor-pointer hover:bg-accent/40"
                  onClick={() => openCreate(row.teamId!, d)}
                  aria-label={`Add phase for ${row.label} on ${toIso(d)}`}
                />
              ))
            })}

            {/* schedule block bars */}
            {rows.map((row, rowIdx) => {
              if (!row.teamId) return null
              const team = teams.find((t) => t.id === row.teamId)
              const { gradient, text } = getTeamGradient(team!)
              const blocks = scheduleBlocks.filter((b) => {
                if (b.teamId !== row.teamId) return false
                return toDate(b.startDate) <= windowEndOfDay && toDate(b.endDate) >= windowStart
              })
              return blocks.map((block) => {
                const job = jobs.find((j) => j.id === block.jobId)
                const blockStart = toDate(block.startDate)
                const blockEnd = toDate(block.endDate)
                const clippedStart = blockStart < windowStart ? windowStart : blockStart
                const clippedEnd = blockEnd > windowEnd ? windowEnd : blockEnd
                const warn = runsIntoWeekend(block.endDate)
                const label = `${block.workArea} · ${job?.address ?? ''}`
                return (
                  <button
                    key={block.id}
                    type="button"
                    style={{
                      gridColumn: `${dayColumn(clippedStart)} / ${dayColumn(clippedEnd) + 1}`,
                      gridRow: rowIdx + 1,
                      backgroundImage: gradient,
                      color: text,
                    }}
                    className="group m-1 flex min-w-0 items-center gap-1 rounded-md px-2.5 text-xs font-medium shadow-sm ring-1 ring-black/5 transition hover:brightness-105 hover:shadow-md"
                    onClick={() => openEdit(block)}
                    title={`${job?.address} — ${block.workArea}${warn ? ' (runs into weekend)' : ''}`}
                  >
                    <span className="min-w-0 truncate">{label}</span>
                    {warn && <TriangleAlert className="size-3 shrink-0" />}
                  </button>
                )
              })
            })}
          </div>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Clicking an empty slot opens the Add Phase form pre-filled with that Team + date. Clicking an existing bar opens the same
        form pre-filled for editing. No drag-to-move/resize in Stage 1. Click the color swatch next to a crew's name to change its
        calendar color.
      </p>

      <AddEditPhaseDialog state={dialogState} onOpenChange={(open) => setDialogState((s) => ({ ...s, open }))} />
    </div>
  )
}
