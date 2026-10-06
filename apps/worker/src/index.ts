import {
  DomainError,
  finishSyncRun,
  getSyncRun,
  importFileContent,
  startSyncRun,
  type Ctx,
} from '@wortwerk/core'
import { getDb } from '@wortwerk/db'
import { createBoss, ensureQueues, importParams, projectJob, queues, type ProjectJob } from '@wortwerk/jobs'
import { createStorage } from '@wortwerk/storage'

const db = getDb()
const storage = createStorage()
const boss = createBoss()

boss.on('error', (error) => console.error('[pg-boss]', error))

async function runImport(job: Extract<ProjectJob, { type: 'import' }>) {
  const run = await getSyncRun({ db, tenantId: job.tenantId }, job.syncRunId)
  const ctx: Ctx = { db, tenantId: job.tenantId, userId: run.createdById, storage }
  const params = importParams.parse(run.params)
  await startSyncRun(ctx, run.id)
  try {
    const bytes = await storage.get(params.storageKey)
    if (!bytes) throw new DomainError('not_found', 'Uploaded file is no longer available')
    const result = await importFileContent(ctx, {
      projectId: job.projectId,
      fileId: params.fileId,
      locale: params.locale,
      content: new TextDecoder().decode(bytes),
      overwrite: params.overwrite,
    })
    await finishSyncRun(ctx, run.id, { result })
    await storage.delete(params.storageKey)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await finishSyncRun(ctx, run.id, { error: message })
    if (!(error instanceof DomainError) && !(error instanceof SyntaxError)) throw error
  }
}

await boss.start()
await ensureQueues(boss)
await boss.work(queues.project, { groupConcurrency: 1, localConcurrency: 4 }, async (jobs) => {
  for (const job of jobs) {
    const data = projectJob.parse(job.data)
    console.info(`[worker] ${data.type} project=${data.projectId} run=${data.syncRunId}`)
    if (data.type === 'import') await runImport(data)
  }
})
console.info('[worker] ready')

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => {
    await boss.stop({ graceful: true })
    await db.pool.end()
    process.exit(0)
  })
}
