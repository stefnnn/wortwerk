import { createDb, schema } from '@wortwerk/db'
import type { Ctx } from '../src/context.ts'

export const db = createDb(process.env.DATABASE_URL!)

export async function createTenant(plan = 'free'): Promise<Ctx> {
  const id = crypto.randomUUID()
  await db
    .insert(schema.tenant)
    .values({ id, name: 'Acme', slug: `acme-${id.slice(0, 8)}`, createdAt: new Date(), plan })
  const userId = crypto.randomUUID()
  await db.insert(schema.user).values({ id: userId, name: 'Ada', email: `${userId}@example.com` })
  return { db, tenantId: id, userId }
}
