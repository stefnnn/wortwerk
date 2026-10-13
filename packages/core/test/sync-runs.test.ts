import { afterAll, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { createProject } from '../src/projects.ts'
import { createSyncRun, failStaleRuns, getSyncRun, startSyncRun } from '../src/sync-runs.ts'
import { createTenant, db } from './helpers.ts'

afterAll(() => db.pool.end())

it('fails runs that have been active for too long', async () => {
  const ctx = await createTenant()
  const project = await createProject(ctx, { name: 'App', slug: 'app', sourceLocale: 'en', locales: ['de'] })
  const stale = await createSyncRun(ctx, project.id, 'machine', {})
  const fresh = await createSyncRun(ctx, project.id, 'machine', {})
  await startSyncRun(ctx, stale.id)
  await startSyncRun(ctx, fresh.id)
  await db.execute(sql`update sync_run set started_at = now() - interval '2 hours' where id = ${stale.id}`)

  expect(await failStaleRuns(db, 30)).toBeGreaterThanOrEqual(1)
  expect(await getSyncRun(ctx, stale.id)).toMatchObject({ status: 'failed' })
  expect(await getSyncRun(ctx, fresh.id)).toMatchObject({ status: 'running' })
})
