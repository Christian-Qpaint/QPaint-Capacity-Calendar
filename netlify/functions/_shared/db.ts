// Shared DB connection for every Netlify Function. Production now points at Supabase Postgres
// (migrated off Netlify DB/Neon on 2026-08-06 to escape Netlify's per-compute-second billing —
// see the QPaintOS project notes) via the DATABASE_URL secret, set only in the production context.
// Supabase speaks plain Postgres wire protocol, so this always uses drizzle-orm/node-postgres —
// there is no Neon-specific HTTP proxy involved here anymore.
//
// `netlify dev`'s local database is still the old Netlify DB local branch for now (a genuine local
// Postgres process, not Neon) — DATABASE_URL is unset there, so it falls through to the previous
// getConnectionString()-based path unchanged. Local dev's own migration off Netlify DB is a
// separate, not-yet-made decision; this file supports both until that's settled.
import { getConnectionString } from '@netlify/database'
import { drizzle as drizzleNodePostgres } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

type Db = ReturnType<typeof drizzleNodePostgres>

// Cached at module scope so a warm Netlify Function container reuses the same connection pool
// across invocations instead of paying a full fresh TCP+TLS+Postgres-auth handshake to the remote
// Supabase pooler on every single call — confirmed via `netlify logs` as the dominant cost behind
// data-bootstrap.mts's 7.7-8.2s response time (12+ parallel queries, each on its own brand-new
// Pool(), previously). `pg.Pool` is explicitly designed to be created once and reused this way; it
// already handles replacing failed/idle connections internally, so there's no staleness risk from
// holding onto it across invocations.
//
// max: 10 (not the more conservative 5 first tried here) — data-bootstrap.mts alone fires 13
// parallel queries per request; a smaller max forced them into multiple sequential waves (queueing
// past the pool's connection limit), undoing some of the caching win for exactly the function this
// mattered most for. Supabase's own pooler (port 6543, transaction mode) is already doing the real
// upstream multiplexing, so a single warm instance holding up to 10 of its own connections is not
// meaningfully heavier for it. keepAlive helps the underlying TCP connections survive the idle gaps
// between invocations (a Netlify Function container can sit idle for a while between calls), so a
// "warm" cached pool is more likely to still have a genuinely live connection to reuse rather than
// silently reconnecting anyway on the next query.
let cachedDb: Db | null = null

export function getDb(): Db {
  if (cachedDb) return cachedDb
  const supabaseUrl = process.env.DATABASE_URL
  if (supabaseUrl) {
    // Supabase requires SSL; node-postgres does not negotiate it by default from a bare
    // connection string the way some other clients do. rejectUnauthorized: false matches how
    // this same connection was already verified working during the migration scripts.
    cachedDb = drizzleNodePostgres({
      client: new Pool({ connectionString: supabaseUrl, ssl: { rejectUnauthorized: false }, max: 10, keepAlive: true }),
    })
  } else {
    // Local dev's Netlify DB branch is a plain local Postgres process with no SSL at all.
    cachedDb = drizzleNodePostgres({ client: new Pool({ connectionString: getConnectionString(), max: 10, keepAlive: true }) })
  }
  return cachedDb
}
