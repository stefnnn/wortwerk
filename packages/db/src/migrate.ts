import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { createDb } from './index.ts'

const db = createDb(process.env.DATABASE_URL!)
await migrate(db, { migrationsFolder: new URL('../migrations', import.meta.url).pathname })
await db.pool.end()
console.log('migrations applied')
