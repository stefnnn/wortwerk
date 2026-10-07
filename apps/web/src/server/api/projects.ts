import { Hono } from 'hono'
import { validate } from './validate.ts'
import { z } from 'zod'
import {
  addLocale,
  createProject,
  createProjectInput,
  deleteFile,
  deleteProject,
  exportFileContent,
  fileInput,
  getFile,
  listProjects,
  listSyncRuns,
  getSyncRun,
  localeCode,
  localeStats,
  sourceSyncCounts,
  removeLocale,
  updateProject,
  updateProjectInput,
  upsertFile,
  createSyncRun,
  DomainError,
  getRepoLink,
} from '@wortwerk/core'
import { formatFromPath } from '@wortwerk/formats'
import { enqueueProjectJob } from '@wortwerk/jobs'
import { requireProject, type Env } from './context.ts'
import { getBoss } from '../services.ts'
import { projectGit, queueRun } from './git.ts'

const maxUploadBytes = 20 * 1024 * 1024

const importForm = z.object({
  file: z.instanceof(File),
  locale: localeCode,
  fileId: z.string().optional(),
  path: z.string().optional(),
  overwrite: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
})

const project = new Hono<Env>()
  .use(requireProject)
  .get('/', (c) => c.json(c.get('project')))
  .patch('/', validate('json', updateProjectInput), async (c) =>
    c.json(await updateProject(c.get('ctx'), c.get('project').id, c.req.valid('json'))),
  )
  .delete('/', async (c) => {
    await deleteProject(c.get('ctx'), c.get('project').id)
    return c.body(null, 204)
  })
  .get('/stats', async (c) => c.json(await localeStats(c.get('ctx'), c.get('project').id)))
  .get('/source-sync', async (c) => c.json(await sourceSyncCounts(c.get('ctx'), c.get('project').id)))
  .post('/locales', validate('json', z.object({ code: localeCode })), async (c) => {
    await addLocale(c.get('ctx'), c.get('project').id, c.req.valid('json').code)
    return c.body(null, 204)
  })
  .delete('/locales/:code', async (c) => {
    await removeLocale(c.get('ctx'), c.get('project').id, c.req.param('code'))
    return c.body(null, 204)
  })
  .post('/files', validate('json', fileInput), async (c) => {
    const ctx = c.get('ctx')
    const p = c.get('project')
    const file = await upsertFile(ctx, p.id, c.req.valid('json'))
    if (!p.files.length && (await getRepoLink(ctx, p.id))) {
      await queueRun(ctx, p.id, { kind: 'pull', params: { trigger: 'connect', force: true } })
    }
    return c.json(file, 201)
  })
  .delete('/files/:fileId', async (c) => {
    const file = await getFile(c.get('ctx'), c.req.param('fileId'))
    if (file.projectId !== c.get('project').id) throw new DomainError('not_found', 'File not found')
    await deleteFile(c.get('ctx'), file.id)
    return c.body(null, 204)
  })
  .get('/files/:fileId/export', validate('query', z.object({ locale: localeCode })), async (c) => {
    const file = await getFile(c.get('ctx'), c.req.param('fileId'))
    if (file.projectId !== c.get('project').id) throw new DomainError('not_found', 'File not found')
    const { path, content } = await exportFileContent(c.get('ctx'), {
      fileId: file.id,
      locale: c.req.valid('query').locale,
    })
    const filename = path.split('/').pop()!
    return c.body(content, 200, {
      'content-type': 'application/octet-stream',
      'content-disposition': `attachment; filename="${filename.replace(/"/g, '')}"`,
    })
  })
  .post('/imports', validate('form', importForm), async (c) => {
    const ctx = c.get('ctx')
    const p = c.get('project')
    const form = c.req.valid('form')
    if (form.file.size > maxUploadBytes) throw new DomainError('invalid', 'File is larger than 20 MB')

    let fileId = form.fileId
    if (!fileId) {
      const pattern = form.path?.trim() || form.file.name.replace(form.locale, '%locale%')
      const format = formatFromPath(form.file.name)
      if (!format) throw new DomainError('invalid', 'Unsupported file type, use .json, .yml/.yaml or .po')
      const path = pattern.includes('%locale%') ? pattern : `%locale%/${pattern}`
      fileId = (await upsertFile(ctx, p.id, { path, format })).id
    } else if ((await getFile(ctx, fileId)).projectId !== p.id) {
      throw new DomainError('not_found', 'File not found')
    }

    const storageKey = `tenants/${ctx.tenantId}/imports/${crypto.randomUUID()}`
    await ctx.storage!.put(storageKey, new Uint8Array(await form.file.arrayBuffer()))
    const run = await createSyncRun(ctx, p.id, 'import', {
      fileId,
      locale: form.locale,
      storageKey,
      overwrite: form.overwrite,
      filename: form.file.name,
    })
    await enqueueProjectJob(await getBoss(), {
      type: 'import',
      tenantId: ctx.tenantId,
      projectId: p.id,
      syncRunId: run.id,
    })
    return c.json(run, 202)
  })
  .route('/', projectGit)
  .get('/runs', async (c) => c.json(await listSyncRuns(c.get('ctx'), c.get('project').id)))
  .get('/runs/:runId', async (c) => {
    const run = await getSyncRun(c.get('ctx'), c.req.param('runId'))
    if (run.projectId !== c.get('project').id) throw new DomainError('not_found', 'Sync run not found')
    return c.json(run)
  })

export const projects = new Hono<Env>()
  .get('/', async (c) => c.json(await listProjects(c.get('ctx'))))
  .post('/', validate('json', createProjectInput), async (c) =>
    c.json(await createProject(c.get('ctx'), c.req.valid('json')), 201),
  )
  .route('/:project', project)
