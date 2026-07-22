// Date-window helpers for the Capacity Board. A Schedule Block's phase_hours is spread evenly
// across its weekdays (Mon-Fri) — crews aren't modeled as working weekends — then apportioned into
// whatever week/month window is being viewed. This is a modeling choice not spelled out in the
// locked spec (which only fixes the phase_hours/phase_value totals, not their day-by-day shape),
// kept simple and documented here rather than left implicit.

/** Parses a "YYYY-MM-DD" string as local midnight — bare `new Date(iso)` parses as UTC, which
 * shifts the date by a day in any timezone away from UTC+0. Use this everywhere a stored ISO date
 * string needs comparing against other local Date objects (e.g. calendar window bounds). */
/** Today's date as a local "YYYY-MM-DD" string — see toDate() above for why not toISOString(). */
export function todayIso(): string {
  const d = new Date()
  const y = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${mo}-${day}`
}

export function toDate(iso: string): Date {
  const d = new Date(iso + 'T00:00:00')
  return d
}

function isWeekday(d: Date): boolean {
  const day = d.getDay()
  return day !== 0 && day !== 6
}

function eachDay(start: Date, end: Date): Date[] {
  const days: Date[] = []
  const cur = new Date(start)
  while (cur <= end) {
    days.push(new Date(cur))
    cur.setDate(cur.getDate() + 1)
  }
  return days
}

export function countWeekdaysBetween(startIso: string, endIso: string): number {
  return eachDay(toDate(startIso), toDate(endIso)).filter(isWeekday).length
}

/** Hours from a block's total phaseHours that fall within [windowStart, windowEnd] (inclusive). */
export function hoursInWindow(
  block: { startDate: string; endDate: string; phaseHours: number },
  windowStart: Date,
  windowEnd: Date,
): number {
  const blockStart = toDate(block.startDate)
  const blockEnd = toDate(block.endDate)
  const totalWeekdays = eachDay(blockStart, blockEnd).filter(isWeekday).length
  if (totalWeekdays === 0) return 0
  const hoursPerDay = block.phaseHours / totalWeekdays

  const overlapStart = blockStart > windowStart ? blockStart : windowStart
  const overlapEnd = blockEnd < windowEnd ? blockEnd : windowEnd
  if (overlapStart > overlapEnd) return 0

  const overlapWeekdays = eachDay(overlapStart, overlapEnd).filter(isWeekday).length
  return hoursPerDay * overlapWeekdays
}

export function runsIntoWeekend(endIso: string): boolean {
  const day = toDate(endIso).getDay()
  return day === 0 || day === 6
}

/** Monday-start week containing the given date. */
export function weekStart(d: Date): Date {
  const copy = new Date(d)
  const day = copy.getDay()
  const diff = day === 0 ? -6 : 1 - day
  copy.setDate(copy.getDate() + diff)
  copy.setHours(0, 0, 0, 0)
  return copy
}

export function weekEnd(start: Date): Date {
  const end = new Date(start)
  end.setDate(end.getDate() + 6)
  return end
}

export function monthStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

export function monthEnd(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0)
}

export function quarterStart(d: Date): Date {
  return new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1)
}

export function quarterEnd(start: Date): Date {
  return new Date(start.getFullYear(), start.getMonth() + 3, 0)
}

export function yearStart(d: Date): Date {
  return new Date(d.getFullYear(), 0, 1)
}

export function yearEnd(d: Date): Date {
  return new Date(d.getFullYear(), 11, 31)
}

export function formatQuarterLabel(start: Date): string {
  return `Q${Math.floor(start.getMonth() / 3) + 1} ${start.getFullYear()}`
}

export function formatYearLabel(start: Date): string {
  return String(start.getFullYear())
}

export function formatDateRange(start: Date, end: Date): string {
  const sameMonth = start.getMonth() === end.getMonth()
  const dayFmt = (d: Date) => d.getDate()
  const monthFmt = (d: Date) => d.toLocaleDateString('en-AU', { month: 'short' })
  if (sameMonth) {
    return `${dayFmt(start)}–${dayFmt(end)} ${monthFmt(end)} ${end.getFullYear()}`
  }
  return `${dayFmt(start)} ${monthFmt(start)} – ${dayFmt(end)} ${monthFmt(end)} ${end.getFullYear()}`
}

export function formatMonthLabel(d: Date): string {
  return d.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })
}

export function formatFullDate(d: Date): string {
  return d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}

export function addDays(d: Date, n: number): Date {
  const copy = new Date(d)
  copy.setDate(copy.getDate() + n)
  return copy
}

/** Adds whole months, pinned to the 1st to avoid day-of-month rollover (e.g. Jan 31 + 1mo). */
export function addMonths(d: Date, n: number): Date {
  const copy = new Date(d)
  copy.setDate(1)
  copy.setMonth(copy.getMonth() + n)
  return copy
}

export function eachDayInRange(start: Date, end: Date): Date[] {
  return eachDay(start, end)
}
