/** Drizzle returns SQL NULL as `null` for unset optional columns, but the app's TypeScript types
 * model those fields as optional (`field?: T`) and the old PostgREST-based client returned them
 * omitted, not null. Stripping null-valued keys here keeps every downstream `field ?? default` /
 * `if (field)` check behaving exactly the same as before. */
export function stripNulls<T extends Record<string, unknown>>(row: T): T {
  const result = { ...row }
  for (const key of Object.keys(result)) {
    if (result[key] === null) delete result[key]
  }
  return result
}

export function stripNullsAll<T extends Record<string, unknown>>(rows: T[]): T[] {
  return rows.map(stripNulls)
}
