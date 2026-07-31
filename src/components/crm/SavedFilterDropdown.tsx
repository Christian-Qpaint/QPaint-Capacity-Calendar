import { useMemo, useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ListFilter, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CrmSavedFilter } from '@/types'

/** Pipedrive-style saved-filter dropdown — a searchable list of the deal filters copied in from
 * Pipedrive (see crm_saved_filters). Selecting one is mutually exclusive with the ad-hoc Advanced
 * Filter builder, matching how Pipedrive itself treats picking a named filter vs. building
 * conditions by hand. Filters that couldn't be faithfully translated (references something this
 * app doesn't track — see savedFilterSql.ts) show disabled with the reason instead of being
 * silently omitted or silently wrong. */
export function SavedFilterDropdown({
  filters,
  activeId,
  onSelect,
}: {
  filters: CrmSavedFilter[]
  activeId: string | null
  onSelect: (id: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const sorted = [...filters].sort((a, b) => a.order - b.order)
    if (!q) return sorted
    return sorted.filter((f) => f.name.toLowerCase().includes(q))
  }, [filters, search])

  const active = filters.find((f) => f.id === activeId) ?? null

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button variant="outline" size="sm">
            <ListFilter /> {active ? active.name : 'Saved filters'}
          </Button>
        }
      />
      <PopoverContent align="start" className="w-80 p-0">
        <div className="relative border-b border-border p-2">
          <Search className="pointer-events-none absolute top-1/2 left-4.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search filters…"
            className="h-8 pl-8"
          />
        </div>
        <div className="max-h-80 overflow-y-auto p-1">
          {active && (
            <button
              type="button"
              onClick={() => {
                onSelect(null)
                setOpen(false)
              }}
              className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent"
            >
              <X className="size-3.5" /> Clear selection
            </button>
          )}
          {filtered.length === 0 && <p className="px-2 py-4 text-center text-xs text-muted-foreground">No filters match.</p>}
          {filtered.map((f) => (
            <button
              key={f.id}
              type="button"
              disabled={!f.supported}
              title={f.supported ? undefined : f.unsupportedReason ?? "Can't be applied here"}
              onClick={() => {
                onSelect(f.id)
                setOpen(false)
              }}
              className={cn(
                'flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm',
                f.id === activeId ? 'bg-accent font-medium' : 'hover:bg-accent',
                !f.supported && 'cursor-not-allowed opacity-40 hover:bg-transparent',
              )}
            >
              <span className="truncate">{f.name}</span>
              {!f.supported && <span className="shrink-0 text-[10px] text-muted-foreground">Unavailable</span>}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
