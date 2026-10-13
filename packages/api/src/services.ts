import { openRouterTranslator, type Ctx } from '@wortwerk/core'
import { getDb } from '@wortwerk/db'
import { providersFromEnv } from '@wortwerk/git'
import { createBoss, ensureQueues, type PgBoss } from '@wortwerk/jobs'
import { createStorage } from '@wortwerk/storage'
import { env } from './env.ts'

export const db = getDb()
export const storage = createStorage()
export const providers = providersFromEnv()
export const translator = env.OPENROUTER_API_KEY
  ? openRouterTranslator({ apiKey: env.OPENROUTER_API_KEY, model: env.MT_MODEL, appUrl: env.APP_URL })
  : null

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

export function tenantCtx(tenantId: string, userId: string | null = null): Ctx {
  return { db, tenantId, userId, storage }
}
