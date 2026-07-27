// Shared DB connection for every Netlify Function. Deliberately wired through
// `drizzle-orm/neon-http` + `@netlify/database`'s `getConnectionString()` directly, NOT the
// `drizzle-orm/netlify-db` convenience wrapper — that wrapper's session adapter calls Neon's
// serverless HTTP client using an old positional-args calling convention
// (`this.httpClient(sql, params, options)`) that current `@neondatabase/serverless` versions
// reject at runtime ("This function can now be called only as a tagged-template function").
// Confirmed via a real deployed test query: `drizzle-orm/netlify-db` fails on every query (even a
// plain `db.select().from(table)`); this direct `neon-http` wiring works.
import { neon } from '@neondatabase/serverless'
import { getConnectionString } from '@netlify/database'
import { drizzle } from 'drizzle-orm/neon-http'

export function getDb() {
  return drizzle({ client: neon(getConnectionString()) })
}
