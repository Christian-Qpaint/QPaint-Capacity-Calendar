import { useMemo, useState, type ComponentType } from 'react'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatCurrency } from '@/lib/formulas'
import { cn } from '@/lib/utils'
import { ArrowDown, ArrowUp, ArrowUpDown, HandCoins, Info, Receipt, Search, TrendingDown, TrendingUp } from 'lucide-react'

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
// cost of goods sold), not from timing which invoices happen to be outstanding right now.
const MOCK_GROSS_PROFIT = 96230.5

function formatWhen(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

type SortKey = 'who' | 'amount' | 'when'
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

  const totals = useMemo(() => {
    const receivables = MOCK_ENTRIES.filter((e) => e.type === 'Receivable').reduce((sum, e) => sum + e.amount, 0)
    const payables = MOCK_ENTRIES.filter((e) => e.type === 'Payable').reduce((sum, e) => sum + e.amount, 0)
    return { receivables, payables }
  }, [])

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, direction: s.direction === 'asc' ? 'desc' : 'asc' } : { key, direction: 'asc' }))
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return MOCK_ENTRIES.filter((e) => {
      if (typeFilter !== 'all' && e.type !== typeFilter) return false
      if (q && !e.who.toLowerCase().includes(q)) return false
      return true
    })
  }, [search, typeFilter])

  const sorted = useMemo(() => {
    const dir = sort.direction === 'asc' ? 1 : -1
    return [...filtered].sort((a, b) => {
      if (sort.key === 'amount') return (a.amount - b.amount) * dir
      if (sort.key === 'when') return a.when.localeCompare(b.when) * dir
      return a.who.localeCompare(b.who) * dir
    })
  }, [filtered, sort])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-medium">Finance</h1>
        <p className="text-sm text-muted-foreground">Receivables, payables, and gross profit — pulled from Xero once connected.</p>
      </div>

      <Card className="flex items-start gap-2 border-info/30 bg-info-bg/60 p-3 text-xs text-info">
        <Info className="size-4 shrink-0" />
        <p>
          Preview with mock data — the layout is real, the numbers aren't. Once the Xero API connection is set up, this page
          switches to live figures automatically.
        </p>
      </Card>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard label="Receivables" value={formatCurrency(totals.receivables)} icon={HandCoins} tone="info" hint="Owed to you by clients" />
        <KpiCard label="Payables" value={formatCurrency(totals.payables)} icon={Receipt} tone="warning" hint="Owed by you to suppliers" />
        <KpiCard
          label="Gross Profit"
          value={formatCurrency(MOCK_GROSS_PROFIT)}
          icon={MOCK_GROSS_PROFIT >= 0 ? TrendingUp : TrendingDown}
          tone={MOCK_GROSS_PROFIT >= 0 ? 'success' : 'danger'}
          hint="This month, from Xero's P&L"
        />
      </div>

      <Card className="gap-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
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
                <TableHead className="w-32">Type</TableHead>
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
                    <span
                      className={cn(
                        'inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-medium',
                        entry.type === 'Receivable' ? 'bg-info-bg text-info' : 'bg-warning-bg text-warning',
                      )}
                    >
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
