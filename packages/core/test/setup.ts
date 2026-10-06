import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { sql } from 'drizzle-orm'
import { createDb } from '@wortwerk/db'

export async function setup() {
  const url = process.env.DATABASE_URL
  if (!url || !new URL(url).pathname.endsWith('_test')) {
    throw new Error(`refusing to reset a database whose name does not end in _test: ${url}`)
  }
  const db = createDb(url)
  await db.execute(
    sql`drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public`,
  )
  await migrate(db, { migrationsFolder: new URL('../../db/migrations', import.meta.url).pathname })
  await db.pool.end()
}
