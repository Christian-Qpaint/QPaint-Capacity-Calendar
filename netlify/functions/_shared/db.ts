// Shared DB connection for every Netlify Function. Production's Netlify Database is real Neon,
// whose connection string embeds credentials (postgresql://user:password@host/db) and speaks
// Neon's HTTP proxy protocol — drizzle-orm/neon-http, wired directly (not the drizzle-orm/
// netlify-db convenience wrapper, whose session adapter calls Neon's serverless HTTP client using
// an old positional-args calling convention current @neondatabase/serverless versions reject at
// runtime: "This function can now be called only as a tagged-template function". Confirmed via a
// real deployed test query.
//
// `netlify dev`'s local database, however, is a genuine local Postgres process, not Neon — its
// connection string has no embedded credentials (postgres://localhost:PORT/postgres), which
// neon()'s strict format validation rejects outright ("Database connection string format for
// `neon()` should be..."), failing every single query. Detecting which kind of connection string
// we were handed and routing to the matching driver (still both through Drizzle's query builder,
// so every call site elsewhere is unaffected) is what makes `netlify dev` usable for real
// login/data testing without needing a full deploy just to check a change.
import { neon } from '@neondatabase/serverless'
import { getConnectionString } from '@netlify/database'
import { drizzle as drizzleNeonHttp } from 'drizzle-orm/neon-http'
import { drizzle as drizzleNodePostgres } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

const NEON_CONNECTION_STRING = /^postgres(ql)?:\/\/[^@/]+:[^@/]+@/

// Both branches are real Postgres backends Drizzle fully supports with the exact same query
// builder surface every call site here already uses (.select/.insert/.returning/.execute etc) —
// the two driver adapters just have slightly different TS overloads for a couple of methods, which
// would otherwise force every call site to satisfy BOTH signatures via an inferred union return
// type. Asserting the production (neon-http) type as this function's single return type keeps call
// sites simple; it doesn't change any actual runtime behavior, which dispatches off the real
// underlying driver session, not this type annotation.
type Db = ReturnType<typeof drizzleNeonHttp>

export function getDb(): Db {
  const connectionString = getConnectionString()
  if (NEON_CONNECTION_STRING.test(connectionString)) {
    return drizzleNeonHttp({ client: neon(connectionString) })
  }
  return drizzleNodePostgres({ client: new Pool({ connectionString }) }) as unknown as Db
}
