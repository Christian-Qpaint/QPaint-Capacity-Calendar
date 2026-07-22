import { useEffect, useMemo, useRef, useState } from 'react'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { Plus, X } from 'lucide-react'
import {
  FILTER_FIELDS,
  operatorsForType,
  type FilterCondition,
  type FilterFieldKey,
  type MatchMode,
} from '@/lib/jobFilters'

function newCondition(id: string): FilterCondition {
  const first = FILTER_FIELDS[0]
  return { id, field: first.key, operator: operatorsForType(first.type)[0].value, value: '' }
}

export function JobsAdvancedFilterDialog({
  open,
  onOpenChange,
  conditions,
  matchMode,
  onApply,
  stageOptions,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  conditions: FilterCondition[]
  matchMode: MatchMode
  onApply: (conditions: FilterCondition[], matchMode: MatchMode) => void
  /** All Pipeline stage options to offer, computed from live job data — overrides the static
   * (schedulable-only) options baked into FILTER_FIELDS so every stage can be filtered on. */
  stageOptions: { value: string; label: string }[]
}) {
  const [draft, setDraft] = useState<FilterCondition[]>(conditions)
  const [draftMode, setDraftMode] = useState<MatchMode>(matchMode)
  const nextId = useRef(0)

  const fields = useMemo(
    () => FILTER_FIELDS.map((f) => (f.key === 'pipelineStage' ? { ...f, options: stageOptions } : f)),
    [stageOptions],
  )

  useEffect(() => {
    if (!open) return
    setDraft(conditions.length ? conditions : [])
    setDraftMode(matchMode)
    nextId.current = conditions.length
  }, [open])

  function addCondition() {
    setDraft((rows) => [...rows, newCondition(`c${nextId.current++}`)])
  }

  function removeCondition(id: string) {
    setDraft((rows) => rows.filter((r) => r.id !== id))
  }

  function updateCondition(id: string, patch: Partial<FilterCondition>) {
    setDraft((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  function changeField(id: string, field: FilterFieldKey) {
    const config = fields.find((f) => f.key === field)!
    updateCondition(id, { field, operator: operatorsForType(config.type)[0].value, value: '' })
  }

  function handleApply() {
    onApply(
      draft.filter((c) => c.value !== ''),
      draftMode,
    )
    onOpenChange(false)
  }

  function handleClear() {
    setDraft([])
    onApply([], draftMode)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Advanced filter</DialogTitle>
          <DialogDescription>Build one or more conditions, then choose how they combine.</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 space-y-3 overflow-y-auto pr-1">
          {draft.length > 0 && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Match</span>
              <div className="inline-flex rounded-lg border border-input p-0.5">
                {(['AND', 'OR'] as MatchMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setDraftMode(mode)}
                    className={cn(
                      'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                      draftMode === mode ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {mode === 'AND' ? 'All conditions (AND)' : 'Any condition (OR)'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {draft.length === 0 && (
            <p className="rounded-md border border-dashed border-border py-6 text-center text-sm text-muted-foreground">
              No conditions yet — add one to narrow down the Jobs List.
            </p>
          )}

          <div className="space-y-2">
            {draft.map((condition) => {
              const config = fields.find((f) => f.key === condition.field)!
              const ops = operatorsForType(config.type)
              return (
                <div key={condition.id} className="flex flex-wrap items-center gap-2 rounded-md border border-border p-2">
                  <Select value={condition.field} onValueChange={(v) => v && changeField(condition.id, v as FilterFieldKey)}>
                    <SelectTrigger className="w-36"><SelectValue>{(v: string | null) => fields.find((f) => f.key === v)?.label}</SelectValue></SelectTrigger>
                    <SelectContent>
                      {fields.map((f) => (
                        <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={condition.operator} onValueChange={(v) => v && updateCondition(condition.id, { operator: v })}>
                    <SelectTrigger className="w-32"><SelectValue>{(v: string | null) => ops.find((o) => o.value === v)?.label}</SelectValue></SelectTrigger>
                    <SelectContent>
                      {ops.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {config.type === 'enum' ? (
                    <Select value={condition.value} onValueChange={(v) => updateCondition(condition.id, { value: v ?? '' })}>
                      <SelectTrigger className="min-w-36 flex-1"><SelectValue>{(v: string | null) => config.options?.find((o) => o.value === v)?.label ?? 'Select…'}</SelectValue></SelectTrigger>
                      <SelectContent>
                        {config.options?.map((o) => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      type={config.type === 'number' ? 'number' : config.type === 'date' ? 'date' : 'text'}
                      placeholder={config.type === 'text' ? 'Value…' : undefined}
                      value={condition.value}
                      onChange={(e) => updateCondition(condition.id, { value: e.target.value })}
                      className="min-w-32 flex-1"
                    />
                  )}

                  <Button variant="ghost" size="icon-sm" onClick={() => removeCondition(condition.id)} aria-label="Remove condition">
                    <X className="size-3.5" />
                  </Button>
                </div>
              )
            })}
          </div>

          <Button variant="outline" size="sm" onClick={addCondition}>
            <Plus /> Add condition
          </Button>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={handleClear}>Clear all</Button>
          <Button onClick={handleApply}>Apply filter</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
