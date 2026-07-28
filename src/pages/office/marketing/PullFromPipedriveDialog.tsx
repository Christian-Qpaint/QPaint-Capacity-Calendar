import { useMemo, useState } from 'react'
import { CloudDownload } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/apiClient'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatCurrency } from '@/lib/formulas'
import { chunkedImportDeals } from '@/lib/marketingImportRunner'
import { useImportProgress } from '@/context/ImportProgressContext'
import type { MarketingDeal } from '@/types'

type PipedriveRow = Omit<MarketingDeal, 'id' | 'importedAt' | 'importBatchId' | 'importSource'>

const MAX_ROWS_SHOWN = 200

export function PullFromPipedriveDialog() {
  const { runImport } = useImportProgress()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [rows, setRows] = useState<PipedriveRow[] | null>(null)
  const [search, setSearch] = useState('')
  const [sourceFilter, setSourceFilter] = useState('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  async function handleFetch() {
    setLoading(true)
    setError(null)
    try {
      const data = await api.get<{ deals: PipedriveRow[]; warnings: string[]; totalFetched: number }>('/api/marketing-pipedrive-deals')
      setRows(data.deals)
      setWarnings(data.warnings ?? [])
      setSelected(new Set())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch from Pipedrive')
    } finally {
      setLoading(false)
    }
  }

  function reset() {
    setRows(null)
    setError(null)
    setWarnings([])
    setSearch('')
    setSourceFilter('all')
    setSelected(new Set())
  }

  const sources = useMemo(() => Array.from(new Set((rows ?? []).map((r) => r.referralSource))).sort(), [rows])

  const filtered = useMemo(() => {
    if (!rows) return []
    const q = search.trim().toLowerCase()
    return rows.filter((r) => {
      if (sourceFilter !== 'all' && r.referralSource !== sourceFilter) return false
      if (!q) return true
      return (r.title ?? '').toLowerCase().includes(q) || r.referralSource.toLowerCase().includes(q) || (r.salesperson ?? '').toLowerCase().includes(q)
    })
  }, [rows, search, sourceFilter])

  function toggle(externalId: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(externalId)) next.delete(externalId)
      else next.add(externalId)
      return next
    })
  }

  function selectAllMatching() {
    setSelected((prev) => new Set([...prev, ...filtered.map((r) => r.externalId!)]))
  }
  function clearSelection() {
    setSelected(new Set())
  }

  function handleImport() {
    if (!rows || selected.size === 0) return
    const batchId = crypto.randomUUID()
    const toImport = rows
      .filter((r) => r.externalId && selected.has(r.externalId))
      .map((r) => ({ ...r, importBatchId: batchId, importSource: 'Pipedrive' }))
    const started = runImport('Pipedrive import', toImport.length, (onProgress) => chunkedImportDeals(toImport, onProgress))
    if (!started) {
      toast.error('An import is already running — wait for it to finish first.')
      return
    }
    toast.success(`Import started — ${toImport.length.toLocaleString()} deals importing in the background.`)
    setOpen(false)
    reset()
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) reset()
        else if (!rows && !loading) handleFetch()
      }}
    >
      <DialogTrigger render={<Button variant="outline" />}>
        <CloudDownload className="size-4" />
        Pull from Pipedrive
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Pull from Pipedrive</DialogTitle>
          <DialogDescription>Fetches every deal live from Pipedrive — pick which ones to bring into Marketing.</DialogDescription>
        </DialogHeader>

        {loading && <p className="py-8 text-center text-sm text-muted-foreground">Fetching deals from Pipedrive…</p>}
        {error && <p className="text-sm text-danger">{error}</p>}

        {!loading && rows && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{rows.length} deals found</Badge>
              <Badge variant="secondary">{selected.size} selected</Badge>
              {warnings.map((w) => (
                <Badge key={w} variant="destructive" className="max-w-full whitespace-normal text-left">{w}</Badge>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Input
                className="w-56"
                placeholder="Search title, source, salesperson…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <Select value={sourceFilter} onValueChange={(v) => setSourceFilter(v ?? 'all')}>
                <SelectTrigger size="sm" className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All sources</SelectItem>
                  {sources.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={selectAllMatching}>
                Select all {filtered.length} matching
              </Button>
              {selected.size > 0 && (
                <Button variant="ghost" size="sm" onClick={clearSelection}>
                  Clear selection
                </Button>
              )}
            </div>

            <div className="max-h-96 overflow-y-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10" />
                    <TableHead>Title</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Quoted</TableHead>
                    <TableHead>Won</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground">No deals match this filter.</TableCell>
                    </TableRow>
                  )}
                  {filtered.slice(0, MAX_ROWS_SHOWN).map((r) => (
                    <TableRow key={r.externalId}>
                      <TableCell>
                        <Checkbox checked={selected.has(r.externalId!)} onCheckedChange={() => toggle(r.externalId!)} />
                      </TableCell>
                      <TableCell className="max-w-56 truncate">{r.title ?? '—'}</TableCell>
                      <TableCell className="max-w-32 truncate">{r.referralSource}</TableCell>
                      <TableCell>{r.rawStage ?? '—'}</TableCell>
                      <TableCell className="text-right">{formatCurrency(r.value)}</TableCell>
                      <TableCell>{r.createdDate}</TableCell>
                      <TableCell>{r.isQuoted ? 'Yes' : '—'}</TableCell>
                      <TableCell>{r.isWon ? 'Yes' : '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {filtered.length > MAX_ROWS_SHOWN && (
                <p className="border-t border-border p-2 text-xs text-muted-foreground">
                  Showing first {MAX_ROWS_SHOWN} of {filtered.length} matching rows — narrow your search to see more, or use "Select all matching".
                </p>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          {error && (
            <Button onClick={handleFetch} disabled={loading}>
              Retry
            </Button>
          )}
          {!error && rows && (
            <Button onClick={handleImport} disabled={selected.size === 0}>
              {`Import ${selected.size} selected`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
