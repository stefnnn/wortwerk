import {
  DomainError,
  createSyncRun,
  findDueExports,
  finishSyncRun,
  getRepoLink,
  getSyncRun,
  gitClientFor,
  importFileContent,
  machineTranslateProject,
  openRouterTranslator,
  pullFromRepo,
  pushToRepo,
  startSyncRun,
  type Ctx,
} from '@wortwerk/core'
import { getDb } from '@wortwerk/db'
import { GitProviderError, providersFromEnv } from '@wortwerk/git'
import {
  createBoss,
  enqueueProjectJob,
  ensureQueues,
  importParams,
  machineParams,
  projectJob,
  pullParams,
  pushParams,
  queues,
  type PgBoss,
  type ProjectJob,
} from '@wortwerk/jobs'
import { createStorage } from '@wortwerk/storage'

const db = getDb()
const storage = createStorage()
const boss = createBoss()
const providers = providersFromEnv()

boss.on('error', (error) => console.error('[pg-boss]', error))

type Job<T extends ProjectJob['type']> = Extract<ProjectJob, { type: T }>

const isPermanent = (error: unknown) =>
  error instanceof DomainError ||
  error instanceof SyntaxError ||
  (error instanceof GitProviderError && error.status >= 400 && error.status < 500 && error.status !== 429)

async function withRun<T extends Record<string, unknown>>(
  job: ProjectJob,
  syncRunId: string,
  fn: (ctx: Ctx, params: Record<string, unknown>) => Promise<T>,
) {
  const run = await getSyncRun({ db, tenantId: job.tenantId }, syncRunId)
  const ctx: Ctx = { db, tenantId: job.tenantId, userId: run.createdById, storage }
  await startSyncRun(ctx, run.id)
  try {
    const result = await fn(ctx, run.params)
    await finishSyncRun(ctx, run.id, { result })
    return result
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await finishSyncRun(ctx, run.id, { error: message })
    if (!isPermanent(error)) throw error
    console.warn(`[worker] ${job.type} project=${job.projectId} failed: ${message}`)
    return null
  }
}

async function runImport(job: Job<'import'>) {
  await withRun(job, job.syncRunId, async (ctx, raw) => {
    const params = importParams.parse(raw)
    const bytes = await storage.get(params.storageKey)
    if (!bytes) throw new DomainError('not_found', 'Uploaded file is no longer available')
    const result = await importFileContent(ctx, {
      projectId: job.projectId,
      fileId: params.fileId,
      locale: params.locale,
      content: new TextDecoder().decode(bytes),
      overwrite: params.overwrite,
    })
    await storage.delete(params.storageKey)
    return result
  })
}

async function clientFor(ctx: Ctx, projectId: string) {
  const link = await getRepoLink(ctx, projectId)
  if (!link) throw new DomainError('not_found', 'The project is not connected to a repository')
  return { link, client: await gitClientFor(ctx, providers, link.connectionId) }
}

async function runPull(job: Job<'pull'>) {
  let schedulePush = false
  await withRun(job, job.syncRunId, async (ctx, raw) => {
    const params = pullParams.parse(raw)
    const { link, client } = await clientFor(ctx, job.projectId)
    const result = await pullFromRepo(ctx, client, { projectId: job.projectId, ...params })
    schedulePush = link.autoExport && (result.changed || !link.lastPushedAt)
    return result
  })
  if (schedulePush) await enqueuePush(boss, job.tenantId, job.projectId, 'pull')
}

async function runPush(job: Job<'push'>) {
  const syncRunId =
    job.syncRunId ??
    (await createSyncRun({ db, tenantId: job.tenantId }, job.projectId, 'push', { trigger: 'auto' })).id
  await withRun(job, syncRunId, async (ctx, raw) => {
    pushParams.parse(raw)
    const { client } = await clientFor(ctx, job.projectId)
    return pushToRepo(ctx, client, { projectId: job.projectId })
  })
}

async function runMachine(job: Job<'machine'>) {
  await withRun(job, job.syncRunId, async (ctx, raw) => {
    const params = machineParams.parse(raw)
    if (!process.env.OPENROUTER_API_KEY)
      throw new DomainError('invalid', 'Machine translation is not configured')
    const translator = openRouterTranslator({
      apiKey: process.env.OPENROUTER_API_KEY,
      model: process.env.MT_MODEL || 'openai/gpt-6-luna',
      appUrl: process.env.APP_URL,
    })
    return machineTranslateProject(ctx, translator, { projectId: job.projectId, ...params })
  })
}

async function enqueuePush(queue: PgBoss, tenantId: string, projectId: string, trigger: 'auto' | 'pull') {
  const run = await createSyncRun({ db, tenantId }, projectId, 'push', { trigger })
  await enqueueProjectJob(queue, { type: 'push', tenantId, projectId, syncRunId: run.id })
}

await boss.start()
await ensureQueues(boss)

await boss.work(queues.project, { groupConcurrency: 1, localConcurrency: 4 }, async (jobs) => {
  for (const job of jobs) {
    const data = projectJob.parse(job.data)
    console.info(`[worker] ${data.type} project=${data.projectId}`)
    if (data.type === 'import') await runImport(data)
    else if (data.type === 'pull') await runPull(data)
    else if (data.type === 'push') await runPush(data)
    else if (data.type === 'machine') await runMachine(data)
  }
})

await boss.schedule(queues.exportSweep, '* * * * *')
await boss.work(queues.exportSweep, async () => {
  for (const due of await findDueExports(db, 60)) {
    const id = await boss.send(
      queues.project,
      { type: 'push', tenantId: due.tenantId, projectId: due.projectId },
      { group: { id: due.projectId }, singletonKey: `push:${due.projectId}`, singletonSeconds: 300 },
    )
    if (id) console.info(`[worker] scheduled export project=${due.projectId}`)
  }
})

console.info(
  `[worker] ready (github: ${providers.github ? 'on' : 'off'}, bitbucket: ${providers.bitbucket ? 'on' : 'off'}, mt: ${process.env.OPENROUTER_API_KEY ? 'on' : 'off'})`,
)

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => {
    await boss.stop({ graceful: true })
    await db.pool.end()
    process.exit(0)
  })
}
