import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useData } from '@/context/DataContext'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatCurrency, weeklyFromMonthly } from '@/lib/formulas'
import { ChevronLeft, ChevronRight } from 'lucide-react'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export function TargetConfigDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { monthlyTargets, upsertMonthlyTarget } = useData()
  const [year, setYear] = useState(() => new Date().getFullYear())
  const [values, setValues] = useState<Record<number, string>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    const forYear: Record<number, string> = {}
    for (let month = 1; month <= 12; month++) {
      const existing = monthlyTargets.find((t) => t.year === year && t.month === month)
      forYear[month] = existing ? String(existing.targetDollars) : ''
    }
    setValues(forYear)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, year])

  function originalValue(month: number): string {
    const existing = monthlyTargets.find((t) => t.year === year && t.month === month)
    return existing ? String(existing.targetDollars) : ''
  }

  async function handleSave() {
    setSaving(true)
    try {
      const changed = Object.entries(values).filter(([month, v]) => v !== originalValue(Number(month)) && v !== '')
      await Promise.all(changed.map(([month, v]) => upsertMonthlyTarget(year, Number(month), Number(v))))
      toast.success(changed.length ? `Saved ${changed.length} month target${changed.length === 1 ? '' : 's'}` : 'Nothing to save')
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save targets')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Configure monthly targets</DialogTitle>
          <DialogDescription>
            Set a $ target for each month to handle seasonal swings. Weekly target is derived automatically (monthly ÷ 4.33).
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 space-y-3 overflow-y-auto pr-1">
          <div className="flex items-center justify-center gap-3">
            <Button variant="ghost" size="icon-sm" onClick={() => setYear((y) => y - 1)} aria-label="Previous year">
              <ChevronLeft />
            </Button>
            <span className="text-sm font-medium">{year}</span>
            <Button variant="ghost" size="icon-sm" onClick={() => setYear((y) => y + 1)} aria-label="Next year">
              <ChevronRight />
            </Button>
          </div>

          <div className="space-y-1.5">
            {MONTH_NAMES.map((name, i) => {
              const month = i + 1
              const value = values[month] ?? ''
              const weekly = value ? weeklyFromMonthly(Number(value)) : 0
              return (
                <div key={month} className="grid grid-cols-3 items-center gap-2 text-sm">
                  <span className="text-muted-foreground">{name}</span>
                  <Input
                    type="number"
                    inputMode="decimal"
                    autoComplete="off"
                    name={`target-${year}-${month}`}
                    placeholder="0"
                    value={value}
                    onChange={(e) => setValues((v) => ({ ...v, [month]: e.target.value }))}
                    className="h-8"
                  />
                  <span className="text-xs text-muted-foreground">
                    {value ? `${formatCurrency(weekly)}/wk` : '—'}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
