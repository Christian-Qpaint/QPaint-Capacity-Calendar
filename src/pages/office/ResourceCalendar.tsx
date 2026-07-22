import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
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
import { jobDisplayName } from '@/lib/jobDisplay'
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
  runsIntoWeekend,
  toDate,
  weekEnd,
  weekStart,
  yearEnd,
  yearStart,
} from '@/lib/schedule'
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ListFilter, TriangleAlert } from 'lucide-react'
import type { ScheduleBlock } from '@/types'

type DragKind = 'move' | 'resize-start' | 'resize-end'

/** Render-driving snapshot of the in-flight drag — mirrors DragMeta but only what the grid needs
 * to compute a live preview position. Kept separate from DragMeta so drag reads/writes to the ref
 * (synchronous, no re-render) don't have to fight React state batching mid-gesture. */
interface DragPreview {
  blockId: string
  kind: DragKind
  originRowIdx: number
  dayDelta: number
  rowDelta: number
  dragging: boolean
}

interface DragMeta extends DragPreview {
  block: ScheduleBlock
  originClientX: number
  originClientY: number
}

type ViewMode = 'day' | 'week' | 'month' | 'rolling3' | 'quarter' | 'year'

const ROW_HEIGHT = 56
const HEADER_HEIGHT = 56
const LABEL_COL_WIDTH = 220
// Quarter/year are deliberately zoomed way out — a bird's-eye view of what's booked, not a
// precise editing surface — so their columns are narrow and the grid just scrolls a long way
// horizontally rather than trying to compress a whole quarter/year to a readable day width.
const DAY_COL_WIDTH: Record<ViewMode, number> = { day: 480, week: 128, month: 60, rolling3: 40, quarter: 32, year: 12 }

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
  const { teams, contractors, scheduleBlocks, jobs, updateTeam, updateScheduleBlock } = useData()
  const [viewMode, setViewMode] = useState<ViewMode>('week')
  const [anchor, setAnchor] = useState(() => new Date())
  // 'all' means every team; once the user touches a checkbox it becomes an explicit id list.
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[] | 'all'>('all')
  const [dialogState, setDialogState] = useState<PhaseDialogState>({ open: false, block: null })
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null)
  const dragMetaRef = useRef<DragMeta | null>(null)

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
    // Rolling 3-month carousel: always the anchor month plus the one either side (e.g. looking at
    // Feb shows Jan–Feb–Mar), sliding by a single month at a time — unlike Quarter, which is
    // pinned to calendar-quarter boundaries and jumps by 3 months.
    if (viewMode === 'rolling3') return eachDayInRange(monthStart(addMonths(anchor, -1)), monthEnd(addMonths(anchor, 1)))
    if (viewMode === 'quarter') return eachDayInRange(quarterStart(anchor), quarterEnd(quarterStart(anchor)))
    if (viewMode === 'year') return eachDayInRange(yearStart(anchor), yearEnd(anchor))
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

  // On the long-scroll views (3 Months/Quarter/Year), the date header only labels each month once
  // at its first column — once you've scrolled past that, there's nothing on screen saying which
  // month you're actually looking at. This tracks scroll position and shows it as a pinned badge.
  const [visibleMonthLabel, setVisibleMonthLabel] = useState('')
  const showVisibleMonthBadge = viewMode === 'rolling3' || viewMode === 'quarter' || viewMode === 'year'

  function updateVisibleMonth(scrollLeft: number) {
    const cw = DAY_COL_WIDTH[viewMode]
    const idx = Math.max(0, Math.min(days.length - 1, Math.floor(scrollLeft / cw)))
    const d = days[idx]
    if (!d) return
    setVisibleMonthLabel(d.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' }))
  }

  useEffect(() => {
    updateVisibleMonth(bodyScrollRef.current?.scrollLeft ?? 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, days])

  function handleBodyScroll() {
    const body = bodyScrollRef.current
    if (!body) return
    if (headerScrollRef.current) headerScrollRef.current.scrollLeft = body.scrollLeft
    if (labelScrollRef.current) labelScrollRef.current.scrollTop = body.scrollTop
    updateVisibleMonth(body.scrollLeft)
  }

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

  function openCreate(teamId: string, date: Date) {
    setDialogState({ open: true, block: null, defaultTeamId: teamId, defaultDate: toIso(date) })
  }
  function openEdit(block: ScheduleBlock) {
    setDialogState({ open: true, block })
  }

  const DRAG_THRESHOLD_PX = 4

  // Custom pointer-driven drag — no dnd library in this project. A plain click (no movement past
  // the threshold) still opens the edit dialog, exactly like before; movement past the threshold
  // commits a move/resize on pointerup. dragMetaRef is the synchronous source of truth read by the
  // window pointerup listener (a plain DOM callback can't rely on a fresh closure over React state);
  // dragPreview is the state copy that actually drives the live re-render.
  function startDrag(e: React.PointerEvent, block: ScheduleBlock, kind: DragKind, rowIdx: number) {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()

    const meta: DragMeta = {
      block,
      blockId: block.id,
      kind,
      originRowIdx: rowIdx,
      originClientX: e.clientX,
      originClientY: e.clientY,
      dayDelta: 0,
      rowDelta: 0,
      dragging: false,
    }
    dragMetaRef.current = meta
    setDragPreview({ blockId: block.id, kind, originRowIdx: rowIdx, dayDelta: 0, rowDelta: 0, dragging: false })

    function onMove(ev: PointerEvent) {
      const cur = dragMetaRef.current
      if (!cur) return
      const dx = ev.clientX - cur.originClientX
      const dy = ev.clientY - cur.originClientY
      const dayDelta = Math.round(dx / colWidth)
      const rowDelta = cur.kind === 'move' ? Math.round(dy / ROW_HEIGHT) : 0
      const dragging = cur.dragging || Math.abs(dx) > DRAG_THRESHOLD_PX || Math.abs(dy) > DRAG_THRESHOLD_PX
      if (cur.dayDelta === dayDelta && cur.rowDelta === rowDelta && cur.dragging === dragging) return
      const next = { ...cur, dayDelta, rowDelta, dragging }
      dragMetaRef.current = next
      setDragPreview({ blockId: next.block.id, kind: next.kind, originRowIdx: next.originRowIdx, dayDelta, rowDelta, dragging })
    }

    async function onUp() {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      const final = dragMetaRef.current
      dragMetaRef.current = null
      setDragPreview(null)
      if (!final) return
      if (!final.dragging) {
        openEdit(final.block)
        return
      }
      if (final.dayDelta === 0 && final.rowDelta === 0) return

      let newStart = final.block.startDate
      let newEnd = final.block.endDate
      let newTeamId = final.block.teamId
      if (final.kind === 'move') {
        newStart = toIso(addDays(toDate(final.block.startDate), final.dayDelta))
        newEnd = toIso(addDays(toDate(final.block.endDate), final.dayDelta))
        if (final.rowDelta !== 0) {
          const targetRow = rows[final.originRowIdx + final.rowDelta]
          if (targetRow?.teamId) newTeamId = targetRow.teamId
        }
      } else if (final.kind === 'resize-start') {
        const candidate = addDays(toDate(final.block.startDate), final.dayDelta)
        if (candidate <= toDate(final.block.endDate)) newStart = toIso(candidate)
      } else {
        const candidate = addDays(toDate(final.block.endDate), final.dayDelta)
        if (candidate >= toDate(final.block.startDate)) newEnd = toIso(candidate)
      }

      if (newStart === final.block.startDate && newEnd === final.block.endDate && newTeamId === final.block.teamId) return
      try {
        await updateScheduleBlock(final.block.id, { startDate: newStart, endDate: newEnd, teamId: newTeamId })
        toast.success('Phase updated — saved')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to save phase move')
      }
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp, { once: true })
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
          <Button size="sm" variant={viewMode === 'rolling3' ? 'secondary' : 'ghost'} onClick={() => setViewMode('rolling3')}>3 Months</Button>
          <Button size="sm" variant={viewMode === 'quarter' ? 'secondary' : 'ghost'} onClick={() => setViewMode('quarter')}>Quarter</Button>
          <Button size="sm" variant={viewMode === 'year' ? 'secondary' : 'ghost'} onClick={() => setViewMode('year')}>Year</Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button size="icon-sm" variant="outline" onClick={goPrev} aria-label="Previous period"><ChevronLeft /></Button>
          <Button size="sm" variant="outline" onClick={goToday}>Today</Button>
          <Button size="icon-sm" variant="outline" onClick={goNext} aria-label="Next period"><ChevronRight /></Button>
          <span className="ml-1 text-base font-medium">{periodLabel}</span>

          {/* Quick-jump controls, independent of the current view's own Prev/Next step — handy for
              skipping around quickly while zoomed into Quarter/Year without spamming Prev/Next. */}
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

        {/* Pinned on screen (doesn't scroll with the grid) — shows whichever month is currently
            in view while scrolling through 3 Months/Quarter/Year, since the header only labels
            each month once at its first column. */}
        {showVisibleMonthBadge && visibleMonthLabel && (
          <div className="absolute top-2 right-3 z-30 rounded-full border border-border bg-popover px-3 py-1 text-xs font-medium shadow-sm">
            {visibleMonthLabel}
          </div>
        )}

        {/* frozen header row (dates) — horizontal position mirrors the body's scrollLeft via JS */}
        <div
          ref={headerScrollRef}
          style={{ left: LABEL_COL_WIDTH, right: 0, height: HEADER_HEIGHT }}
          className="absolute top-0 z-20 overflow-hidden border-b border-border bg-card"
        >
          <div className="flex" style={{ width: days.length * colWidth }}>
            {days.map((d, i) => {
              const isToday = toIso(d) === todayIsoStr
              // Quarter/Year columns are too narrow for a weekday label — just the day number,
              // plus a small month tag at each month boundary so it's still possible to tell where
              // you are while scrolling through a long zoomed-out range.
              const compact = colWidth < 24
              const isMonthStart = d.getDate() === 1
              return (
                <div key={i} style={{ width: colWidth }} className="relative flex flex-col items-center justify-end gap-0.5 pb-2">
                  {compact && isMonthStart && (
                    <span className="absolute top-1 left-0.5 text-[8px] font-semibold tracking-wide whitespace-nowrap text-muted-foreground uppercase">
                      {d.toLocaleDateString('en-AU', { month: 'short' })}
                    </span>
                  )}
                  {!compact && <span className="text-[11px] text-muted-foreground">{d.toLocaleDateString('en-AU', { weekday: 'short' })}</span>}
                  <span
                    className={
                      isToday
                        ? `flex items-center justify-center rounded-full bg-info font-semibold text-white ${compact ? 'size-4 text-[9px]' : 'size-6 text-xs'}`
                        : compact
                          ? 'text-[10px]'
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
              className={cn(
                'flex items-center gap-2 border-t border-border/60 pr-2 pl-4 text-sm',
                // Rows with no teamId (section dividers + multi-crew contractor company rows)
                // can't be clicked to add a phase — a muted band across the whole row (label +
                // grid, see the row-background block below) makes that obvious instead of looking
                // just like any other crew row.
                !row.teamId && 'bg-muted/40',
                row.sectionHeader
                  ? 'border-t-2 border-t-foreground/20 text-xs font-semibold tracking-wide text-muted-foreground uppercase'
                  : row.indent
                    ? 'pl-8 text-muted-foreground'
                    : row.teamId
                      ? 'font-medium'
                      : 'font-medium text-muted-foreground',
              )}
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
            {/* column backgrounds: weekend tint + today highlight, full height. A slightly bolder
                left border on the 1st of each month gives Quarter/Year's long scroll a visual
                anchor — otherwise hundreds of narrow same-width columns are hard to scan. */}
            {days.map((d, i) => {
              const isWeekend = d.getDay() === 0 || d.getDay() === 6
              const isToday = toIso(d) === todayIsoStr
              const isMonthStart = d.getDate() === 1
              return (
                <div
                  key={i}
                  style={{ gridColumn: i + 1, gridRow: `1 / ${rows.length + 1}` }}
                  className={cn(
                    isMonthStart ? 'border-l-2 border-l-foreground/20' : 'border-l border-border/60',
                    isToday ? 'bg-info-bg/70' : isWeekend ? 'bg-muted/50' : '',
                  )}
                />
              )
            })}

            {/* row backgrounds for non-clickable rows (section dividers + multi-crew contractor
                company rows) — nothing here has a teamId to add a phase against, so a muted band
                across the full row signals that instead of looking identical to a real crew row. */}
            {rows.map((row, rowIdx) => {
              if (row.teamId) return null
              return (
                <div
                  key={`rowbg-${row.key}`}
                  style={{ gridColumn: `1 / ${days.length + 1}`, gridRow: rowIdx + 1 }}
                  className="bg-muted/40"
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
                const isDragging = dragPreview?.dragging && dragPreview.blockId === block.id
                let effStart = toDate(block.startDate)
                let effEnd = toDate(block.endDate)
                let effRowIdx = rowIdx
                let effGradient = gradient
                let effText = text
                if (isDragging && dragPreview) {
                  if (dragPreview.kind === 'move') {
                    effStart = addDays(effStart, dragPreview.dayDelta)
                    effEnd = addDays(effEnd, dragPreview.dayDelta)
                    if (dragPreview.rowDelta !== 0) {
                      const targetRow = rows[rowIdx + dragPreview.rowDelta]
                      if (targetRow?.teamId) {
                        effRowIdx = rowIdx + dragPreview.rowDelta
                        const targetTeam = teams.find((t) => t.id === targetRow.teamId)
                        if (targetTeam) {
                          const g = getTeamGradient(targetTeam)
                          effGradient = g.gradient
                          effText = g.text
                        }
                      }
                    }
                  } else if (dragPreview.kind === 'resize-start') {
                    const candidate = addDays(effStart, dragPreview.dayDelta)
                    if (candidate <= effEnd) effStart = candidate
                  } else if (dragPreview.kind === 'resize-end') {
                    const candidate = addDays(effEnd, dragPreview.dayDelta)
                    if (candidate >= effStart) effEnd = candidate
                  }
                }
                const clippedStart = effStart < windowStart ? windowStart : effStart
                const clippedEnd = effEnd > windowEnd ? windowEnd : effEnd
                const warn = runsIntoWeekend(toIso(effEnd))
                const label = `${block.workArea} · ${job ? jobDisplayName(job) : ''}`
                return (
                  <button
                    key={block.id}
                    type="button"
                    style={{
                      gridColumn: `${dayColumn(clippedStart)} / ${dayColumn(clippedEnd) + 1}`,
                      gridRow: effRowIdx + 1,
                      backgroundImage: effGradient,
                      color: effText,
                      touchAction: 'none',
                    }}
                    className={cn(
                      'group relative m-1 flex min-w-0 cursor-grab items-center gap-1 rounded-md px-2.5 text-xs font-medium shadow-sm ring-1 ring-black/5 transition hover:brightness-105 hover:shadow-md',
                      isDragging && 'z-10 cursor-grabbing shadow-lg ring-2 ring-foreground/50 transition-none',
                    )}
                    onPointerDown={(e) => startDrag(e, block, 'move', rowIdx)}
                    title={`${job?.address} — ${block.workArea}${warn ? ' (runs into weekend)' : ''} — drag to move, drag the edges to resize`}
                  >
                    <span
                      className="absolute inset-y-0 left-0 w-2 cursor-ew-resize rounded-l-md hover:bg-black/10"
                      onPointerDown={(e) => {
                        e.stopPropagation()
                        startDrag(e, block, 'resize-start', rowIdx)
                      }}
                    />
                    <span className="min-w-0 truncate">{label}</span>
                    {warn && <TriangleAlert className="size-3 shrink-0" />}
                    <span
                      className="absolute inset-y-0 right-0 w-2 cursor-ew-resize rounded-r-md hover:bg-black/10"
                      onPointerDown={(e) => {
                        e.stopPropagation()
                        startDrag(e, block, 'resize-end', rowIdx)
                      }}
                    />
                  </button>
                )
              })
            })}
          </div>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Clicking an empty slot opens the Add Phase form pre-filled with that Team + date. Click an existing bar to edit it, or drag it
        to move the phase to a new date/crew — drag its left or right edge to shrink or extend it. Moves and resizes save
        automatically. Click the color swatch next to a crew's name to change its calendar color.
      </p>

      <AddEditPhaseDialog state={dialogState} onOpenChange={(open) => setDialogState((s) => ({ ...s, open }))} />
    </div>
  )
}
