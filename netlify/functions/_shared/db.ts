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

export function getDb(): Db {
  const connectionString = process.env.DATABASE_URL || getConnectionString()
  return drizzleNodePostgres({ client: new Pool({ connectionString }) })
}
