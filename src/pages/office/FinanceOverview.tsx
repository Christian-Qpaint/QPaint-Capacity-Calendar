import { useMemo, useState, type ComponentType } from 'react'
import * as XLSX from 'xlsx'
import { toast } from 'sonner'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { usePersistedState } from '@/hooks/usePersistedState'
import { formatCurrency } from '@/lib/formulas'
import { cn } from '@/lib/utils'
import {
  addDays,
  addMonths,
  formatDateRange,
  formatFullDate,
  formatMonthLabel,
  formatMonthRangeLabel,
  formatYearLabel,
  monthEnd,
  monthStart,
  toIsoDate,
  weekEnd,
  weekStart,
  yearEnd,
  yearStart,
} from '@/lib/schedule'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  FileDown,
  HandCoins,
  Info,
  Receipt,
  Search,
  TrendingDown,
  TrendingUp,
  Upload,
} from 'lucide-react'

// Mock data only — this page previews the layout Tas asked for (3 headline cards + a detail
// table of who/how much/when) ahead of the real Xero integration. Once that's wired up, this
// whole file's data source changes to a live fetch; the layout below is meant to be the real one,
// not a throwaway sketch.
type EntryType = 'Receivable' | 'Payable'

interface FinanceEntry {
  id: string
  type: EntryType
  who: string
  amount: number
  when: string // ISO date
}

const MOCK_ENTRIES: FinanceEntry[] = [
  { id: '1', type: 'Receivable', who: 'Wightman Properties', amount: 12480, when: '2026-09-18' },
  { id: '2', type: 'Receivable', who: 'Department of Housing and Public Works', amount: 34290, when: '2026-09-15' },
  { id: '3', type: 'Receivable', who: 'Scott Rickard', amount: 8950, when: '2026-09-12' },
  { id: '4', type: 'Receivable', who: 'QBUILD SEQ MRC', amount: 21760, when: '2026-09-08' },
  { id: '5', type: 'Receivable', who: 'Aussie Residential Group Pty Ltd', amount: 15600, when: '2026-08-29' },
  { id: '6', type: 'Receivable', who: 'Civium Strata', amount: 9870, when: '2026-08-22' },
  { id: '7', type: 'Payable', who: 'Brisbane Contract Painters', amount: 6420, when: '2026-09-19' },
  { id: '8', type: 'Payable', who: 'CS Painting', amount: 3180, when: '2026-09-17' },
  { id: '9', type: 'Payable', who: 'Ebi _ Subbie', amount: 4750, when: '2026-09-14' },
  { id: '10', type: 'Payable', who: 'Resene Paints', amount: 2890, when: '2026-09-10' },
  { id: '11', type: 'Payable', who: 'Dulux Trade', amount: 5340, when: '2026-09-05' },
  { id: '12', type: 'Payable', who: 'Applied Painting', amount: 3960, when: '2026-08-27' },
]

// Not derived from the entries above — real Gross Profit comes from Xero's P&L (revenue minus
// cost of goods sold) for whatever period is selected, not from timing which invoices happen to
// be outstanding right now. Modeled as a flat monthly rate scaled by the selected window's length
// purely so the KPI card has something period-shaped to show; the real integration will fetch the
// actual P&L figure for the window instead of computing it.
const MOCK_MONTHLY_GROSS_PROFIT = 96230.5

function formatWhen(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

type Period = 'day' | 'week' | 'month' | '3months' | '6months' | 'year'

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: '3months', label: '3 Months' },
  { value: '6months', label: '6 Months' },
  { value: 'year', label: 'Year' },
]

function getRange(period: Period, anchor: Date): { start: Date; end: Date; label: string } {
  switch (period) {
    case 'day':
      return { start: anchor, end: anchor, label: formatFullDate(anchor) }
    case 'week': {
      const start = weekStart(anchor)
      const end = weekEnd(start)
      return { start, end, label: `Week of ${formatDateRange(start, end)}` }
    }
    case 'month': {
      const start = monthStart(anchor)
      const end = monthEnd(anchor)
      return { start, end, label: formatMonthLabel(start) }
    }
    case '3months': {
      const start = monthStart(addMonths(anchor, -2))
      const end = monthEnd(anchor)
      return { start, end, label: formatMonthRangeLabel(start, end) }
    }
    case '6months': {
      const start = monthStart(addMonths(anchor, -5))
      const end = monthEnd(anchor)
      return { start, end, label: formatMonthRangeLabel(start, end) }
    }
    case 'year': {
      const start = yearStart(anchor)
      const end = yearEnd(anchor)
      return { start, end, label: formatYearLabel(start) }
    }
  }
}

function stepAnchor(period: Period, anchor: Date, dir: 1 | -1): Date {
  switch (period) {
    case 'day':
      return addDays(anchor, dir)
    case 'week':
      return addDays(anchor, dir * 7)
    case 'month':
      return addMonths(anchor, dir)
    case '3months':
      return addMonths(anchor, dir * 3)
    case '6months':
      return addMonths(anchor, dir * 6)
    case 'year':
      return addMonths(anchor, dir * 12)
  }
}

// How many months the selected window roughly spans, used only to scale the mock Gross Profit
// rate above — the real integration will fetch the actual figure for the window instead.
function monthsInPeriod(period: Period): number {
  switch (period) {
    case 'day':
      return 1 / 30
    case 'week':
      return 7 / 30
    case 'month':
      return 1
    case '3months':
      return 3
    case '6months':
      return 6
    case 'year':
      return 12
  }
}

type SortKey = 'type' | 'who' | 'amount' | 'when'
type SortDirection = 'asc' | 'desc'

// Full, static class strings per tone — Tailwind's build-time scanner only picks up literal
// class names, so a template-literal like `bg-${tone}-bg` would silently compile to no styling
// at all (the class exists in the DOM but never makes it into the generated CSS).
const KPI_TONE_STYLES: Record<'info' | 'warning' | 'success' | 'danger', string> = {
  info: 'bg-info-bg text-info',
  warning: 'bg-warning-bg text-warning',
  success: 'bg-success-bg text-success',
  danger: 'bg-danger-bg text-danger',
}

const TYPE_BADGE_STYLES: Record<EntryType, string> = {
  Receivable: 'bg-info-bg text-info',
  Payable: 'bg-danger-bg text-danger',
}

function KpiCard({
  label,
  value,
  icon: Icon,
  tone,
  hint,
}: {
  label: string
  value: string
  icon: ComponentType<{ className?: string }>
  tone: keyof typeof KPI_TONE_STYLES
  hint?: string
}) {
  return (
    <Card className="gap-2 p-4 transition hover:shadow-md">
      <div className="flex items-center gap-2">
        <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-full', KPI_TONE_STYLES[tone])}>
          <Icon className="size-4" />
        </span>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
      <p className="text-2xl font-semibold tracking-tight">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </Card>
  )
}

function SortableHead({
  label,
  sortKey,
  sort,
  onSort,
  className,
}: {
  label: string
  sortKey: SortKey
  sort: { key: SortKey; direction: SortDirection }
  onSort: (key: SortKey) => void
  className?: string
}) {
  const active = sort.key === sortKey
  const Icon = active ? (sort.direction === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown
  return (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn('inline-flex items-center gap-1 hover:text-foreground', active && 'text-foreground')}
      >
        {label}
        <Icon className={cn('size-3.5', !active && 'opacity-30')} />
      </button>
    </TableHead>
  )
}

export function FinanceOverview() {
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<EntryType | 'all'>('all')
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection }>({ key: 'when', direction: 'desc' })
  const [period, setPeriod] = usePersistedState<Period>('qpaint:finance:period', 'month')
  const [anchor, setAnchor] = usePersistedState<Date>('qpaint:finance:anchor', new Date(), {
    serialize: (d) => d.toISOString(),
    deserialize: (s) => new Date(s),
  })

  const range = useMemo(() => getRange(period, anchor), [period, anchor])
  const grossProfit = MOCK_MONTHLY_GROSS_PROFIT * monthsInPeriod(period)

  function goPrev() {
    setAnchor((a) => stepAnchor(period, a, -1))
  }
  function goNext() {
    setAnchor((a) => stepAnchor(period, a, 1))
  }
  function goToday() {
    setAnchor(new Date())
  }

  const windowEntries = useMemo(() => {
    const startIso = toIsoDate(range.start)
    const endIso = toIsoDate(range.end)
    return MOCK_ENTRIES.filter((e) => e.when >= startIso && e.when <= endIso)
  }, [range])

  const totals = useMemo(() => {
    const receivables = windowEntries.filter((e) => e.type === 'Receivable').reduce((sum, e) => sum + e.amount, 0)
    const payables = windowEntries.filter((e) => e.type === 'Payable').reduce((sum, e) => sum + e.amount, 0)
    return { receivables, payables }
  }, [windowEntries])

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, direction: s.direction === 'asc' ? 'desc' : 'asc' } : { key, direction: 'asc' }))
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return windowEntries.filter((e) => {
      if (typeFilter !== 'all' && e.type !== typeFilter) return false
      if (q && !e.who.toLowerCase().includes(q)) return false
      return true
    })
  }, [windowEntries, search, typeFilter])

  const sorted = useMemo(() => {
    const dir = sort.direction === 'asc' ? 1 : -1
    return [...filtered].sort((a, b) => {
      if (sort.key === 'amount') return (a.amount - b.amount) * dir
      if (sort.key === 'when') return a.when.localeCompare(b.when) * dir
      if (sort.key === 'type') return a.type.localeCompare(b.type) * dir
      return a.who.localeCompare(b.who) * dir
    })
  }, [filtered, sort])

  function handleImport() {
    toast.info('Xero import is coming soon — this button is a placeholder for now.')
  }

  function handleExport(format: 'csv' | 'xlsx') {
    const rows = sorted.map((e) => ({ Type: e.type, Who: e.who, 'How much': e.amount, When: formatWhen(e.when) }))
    const sheet = XLSX.utils.json_to_sheet(rows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, sheet, 'Finance')
    XLSX.writeFile(workbook, `finance-${toIsoDate(range.start)}-to-${toIsoDate(range.end)}.${format}`, { bookType: format })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-lg font-medium">Finance</h1>
          <p className="text-sm text-muted-foreground">Receivables, payables, and gross profit — pulled from Xero once connected.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={handleImport}>
            <Upload className="size-4" /> Import
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="outline">
                  <FileDown className="size-4" /> Export
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleExport('csv')}>Export as CSV</DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport('xlsx')}>Export as Excel (.xlsx)</DropdownMenuItem>
              <DropdownMenuItem onClick={() => window.print()}>Export as PDF</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Card className="flex items-start gap-2 border-info/30 bg-info-bg/60 p-3 text-xs text-info print:hidden">
        <Info className="size-4 shrink-0" />
        <p>
          Preview with mock data — the layout is real, the numbers aren't. Once the Xero API connection is set up, this page
          switches to live figures automatically.
        </p>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex items-center gap-1">
          <Button size="icon-sm" variant="ghost" onClick={goPrev} aria-label="Previous period">
            <ChevronLeft />
          </Button>
          <span className="min-w-40 text-center text-sm font-medium">{range.label}</span>
          <Button size="icon-sm" variant="ghost" onClick={goNext} aria-label="Next period">
            <ChevronRight />
          </Button>
          <Button size="sm" variant="ghost" onClick={goToday}>
            Today
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-1 rounded-lg border border-border p-0.5">
          {PERIOD_OPTIONS.map((opt) => (
            <Button
              key={opt.value}
              size="sm"
              variant={period === opt.value ? 'secondary' : 'ghost'}
              onClick={() => setPeriod(opt.value)}
            >
              {opt.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard
          label="Receivables"
          value={formatCurrency(totals.receivables)}
          icon={HandCoins}
          tone="info"
          hint={`Owed to you by clients — ${range.label}`}
        />
        <KpiCard
          label="Payables"
          value={formatCurrency(totals.payables)}
          icon={Receipt}
          tone="danger"
          hint={`Owed by you to suppliers — ${range.label}`}
        />
        <KpiCard
          label="Gross Profit"
          value={formatCurrency(grossProfit)}
          icon={grossProfit >= 0 ? TrendingUp : TrendingDown}
          tone={grossProfit >= 0 ? 'success' : 'danger'}
          hint={`${range.label}, from Xero's P&L`}
        />
      </div>

      <Card className="gap-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
          <h3 className="text-sm font-medium">Detail</h3>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full max-w-xs">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search who…" className="pl-8" />
            </div>
            <Select value={typeFilter} onValueChange={(v) => v && setTypeFilter(v as EntryType | 'all')}>
              <SelectTrigger size="sm" className="w-36">
                <SelectValue>{(v: unknown) => (v === 'all' ? 'All types' : String(v))}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="Receivable">Receivable</SelectItem>
                <SelectItem value="Payable">Payable</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHead label="Type" sortKey="type" sort={sort} onSort={toggleSort} className="w-32" />
                <SortableHead label="Who" sortKey="who" sort={sort} onSort={toggleSort} />
                <SortableHead label="How much" sortKey="amount" sort={sort} onSort={toggleSort} className="w-36" />
                <SortableHead label="When" sortKey="when" sort={sort} onSort={toggleSort} className="w-36" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                    No entries match your search.
                  </TableCell>
                </TableRow>
              )}
              {sorted.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell>
                    <span className={cn('inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-medium', TYPE_BADGE_STYLES[entry.type])}>
                      {entry.type}
                    </span>
                  </TableCell>
                  <TableCell className="font-medium">{entry.who}</TableCell>
                  <TableCell>{formatCurrency(entry.amount)}</TableCell>
                  <TableCell className="text-muted-foreground">{formatWhen(entry.when)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  )
}
