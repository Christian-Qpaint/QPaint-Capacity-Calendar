import { ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

/** A "faceted filter" dropdown — pick any number of values rather than one, so e.g. two referral
 * sources or three salespeople can be included in the same view at once. Checking an item doesn't
 * close the menu (Base UI's CheckboxItem default), so multiple picks are a single open/close. */
export function MultiSelectFilter({
  label,
  options,
  selected,
  onChange,
}: {
  label: string
  options: string[]
  selected: string[]
  onChange: (next: string[]) => void
}) {
  function toggle(option: string) {
    onChange(selected.includes(option) ? selected.filter((o) => o !== option) : [...selected, option])
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size="sm" className="justify-between" />}>
        <span className="flex items-center gap-1.5">
          {label}
          {selected.length > 0 && <Badge variant="secondary">{selected.length}</Badge>}
        </span>
        <ChevronDown className="size-4 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="max-h-72 min-w-48">
        {options.length === 0 && <DropdownMenuItem disabled>No options</DropdownMenuItem>}
        {selected.length > 0 && (
          <>
            <DropdownMenuItem onClick={() => onChange([])}>Clear ({selected.length})</DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        {options.map((option) => (
          <DropdownMenuCheckboxItem key={option} checked={selected.includes(option)} onCheckedChange={() => toggle(option)}>
            {option}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
