/** Drizzle returns SQL NULL as `null` for unset optional columns, but the app's TypeScript types
 * model those fields as optional (`field?: T`) and the old PostgREST-based client returned them
 * omitted, not null. Stripping null-valued keys here keeps every downstream `field ?? default` /
 * `if (field)` check behaving exactly the same as before. */
export function stripNulls<T extends object>(row: T): T {
  const result = { ...row } as Record<string, unknown>
  for (const key of Object.keys(result)) {
    if (result[key] === null) delete result[key]
  }
  return result as T
}

export function stripNullsAll<T extends object>(rows: T[]): T[] {
  return rows.map(stripNulls)
}
