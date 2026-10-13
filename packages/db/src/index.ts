import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema/index.ts'

export * as schema from './schema/index.ts'

export function createDb(connectionString: string) {
  if (!connectionString) throw new Error('database connection string is required')
  const pool = new Pool({ connectionString })
  return Object.assign(drizzle({ client: pool, schema, casing: 'snake_case' }), { pool })
}

export type Db = ReturnType<typeof createDb>
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
export type DbOrTx = Db | Tx

let instance: Db | undefined

export function getDb() {
  if (!instance) {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error('DATABASE_URL is not set')
    instance = createDb(url)
  }
  return instance
}
