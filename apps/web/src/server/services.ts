import type { Ctx } from '@wortwerk/core'
import { getDb } from '@wortwerk/db'
import { createBoss, ensureQueues, type PgBoss } from '@wortwerk/jobs'
import { createStorage } from '@wortwerk/storage'

export const db = getDb()
export const storage = createStorage()

let boss: Promise<PgBoss> | undefined

export function getBoss() {
  boss ??= (async () => {
    const instance = createBoss({ supervise: false, schedule: false })
    instance.on('error', (error) => console.error('[pg-boss]', error))
    await instance.start()
    await ensureQueues(instance)
    return instance
  })()
  return boss
}

export function tenantCtx(tenantId: string, userId: string): Ctx {
  return { db, tenantId, userId, storage }
}
