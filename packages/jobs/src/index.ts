import { PgBoss, type ConstructorOptions, type SendOptions } from 'pg-boss'
import { z } from 'zod'

const base = { tenantId: z.string(), projectId: z.string() }

export const projectJob = z.discriminatedUnion('type', [
  z.object({ type: z.literal('import'), ...base, syncRunId: z.string() }),
  z.object({ type: z.literal('pull'), ...base, syncRunId: z.string() }),
  z.object({ type: z.literal('push'), ...base, syncRunId: z.string().optional() }),
  z.object({ type: z.literal('machine'), ...base, syncRunId: z.string() }),
])
export type ProjectJob = z.infer<typeof projectJob>

export const queues = {
  project: 'project',
  exportSweep: 'export-sweep',
} as const

export const importParams = z.object({
  fileId: z.string(),
  locale: z.string(),
  storageKey: z.string(),
  overwrite: z.boolean().default(false),
})
export type ImportParams = z.infer<typeof importParams>

export const pullParams = z.object({
  sha: z.string().optional(),
  importTranslations: z.boolean().default(false),
  overwrite: z.boolean().default(false),
  force: z.boolean().default(false),
  trigger: z.enum(['manual', 'webhook', 'ci', 'connect']).default('manual'),
})
export type PullParams = z.input<typeof pullParams>

export const pushParams = z.object({
  trigger: z.enum(['manual', 'auto', 'ci', 'pull']).default('manual'),
})
export type PushParams = z.input<typeof pushParams>

export const machineParams = z.object({
  locale: z.string(),
  keyIds: z.array(z.string()).optional(),
  // validated by core (keySelection) when the job runs
  selection: z.record(z.string(), z.unknown()).optional(),
})
export type MachineParams = z.input<typeof machineParams>

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

export async function enqueueProjectJob(boss: PgBoss, job: ProjectJob, options: SendOptions = {}) {
  return boss.send(queues.project, projectJob.parse(job), { ...options, group: { id: job.projectId } })
}

export type { PgBoss }
