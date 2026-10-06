import { PgBoss, type ConstructorOptions } from 'pg-boss'
import { z } from 'zod'

export const projectJob = z.discriminatedUnion('type', [
  z.object({ type: z.literal('import'), tenantId: z.string(), projectId: z.string(), syncRunId: z.string() }),
])
export type ProjectJob = z.infer<typeof projectJob>

export const queues = {
  project: 'project',
} as const

export const importParams = z.object({
  fileId: z.string(),
  locale: z.string(),
  storageKey: z.string(),
  overwrite: z.boolean().default(false),
})
export type ImportParams = z.infer<typeof importParams>

export function createBoss(options: Partial<ConstructorOptions> = {}) {
  const connectionString = options.connectionString ?? process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL is not set')
  return new PgBoss({ schema: 'pgboss', ...options, connectionString })
}

export async function ensureQueues(boss: PgBoss) {
  for (const name of Object.values(queues)) {
    if (!(await boss.getQueue(name))) await boss.createQueue(name, { retryLimit: 2, retryBackoff: true })
  }
}

export async function enqueueProjectJob(boss: PgBoss, job: ProjectJob) {
  return boss.send(queues.project, projectJob.parse(job), { group: { id: job.projectId } })
}

export type { PgBoss }
