import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { CrmFieldDefinition } from '@/types'

/** Resolves a stored field value to its display label — custom select/multiselect fields store
 * Pipedrive's numeric option id, not the label, so this looks it up in the field's own option
 * list. Falls back to the raw value untouched (covers system-derived enum fields like Source
 * Origin, whose values already ARE the plain label string, not an id). */
export function resolveOptionLabel(definition: CrmFieldDefinition, rawValue: unknown): string {
  const str = String(rawValue)
  const match = definition.options?.find((o) => o.id === str)
  return match?.label ?? str
}

/** One input control per CrmFieldDefinition.fieldType, used both by the deal drawer's edit form
 * and (read-only variants could reuse resolveOptionLabel directly). */
export function CrmFieldInput({
  definition,
  value,
  onChange,
}: {
  definition: CrmFieldDefinition
  value: unknown
  onChange: (value: unknown) => void
}) {
  switch (definition.fieldType) {
    case 'boolean':
      return <Checkbox checked={!!value} onCheckedChange={(checked) => onChange(!!checked)} />
    case 'date':
      return <Input type="date" value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value || null)} />
    case 'number':
    case 'monetary':
      return (
        <Input
          type="number"
          value={value === null || value === undefined ? '' : String(value)}
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        />
      )
    case 'select':
      return (
        <Select value={value ? String(value) : ''} onValueChange={(v) => onChange(v || null)}>
          <SelectTrigger className="w-full">
            <SelectValue>{() => (value ? resolveOptionLabel(definition, value) : 'Not set')}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {(definition.options ?? []).map((o) => (
              <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )
    case 'multiselect': {
      const selected = new Set(Array.isArray(value) ? value.map(String) : [])
      return (
        <div className="flex flex-wrap gap-2 rounded-md border border-border p-2">
          {(definition.options ?? []).map((o) => (
            <label key={o.id} className="flex items-center gap-1.5 text-sm">
              <Checkbox
                checked={selected.has(o.id)}
                onCheckedChange={(checked) => {
                  const next = new Set(selected)
                  if (checked) next.add(o.id)
                  else next.delete(o.id)
                  onChange(Array.from(next))
                }}
              />
              {o.label}
            </label>
          ))}
          {(definition.options ?? []).length === 0 && <span className="text-xs text-muted-foreground">No options configured</span>}
        </div>
      )
    }
    case 'address':
    case 'text':
    default:
      return <Input value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value || null)} />
  }
}
