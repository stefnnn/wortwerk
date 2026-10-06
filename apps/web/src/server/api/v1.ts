import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { DomainError, getRepoLink, getSyncRun, resolveProjectToken, type Ctx } from '@wortwerk/core'
import { db, tenantCtx } from '../services.ts'
import { queueRun } from './git.ts'

type V1Env = { Variables: { ctx: Ctx; projectId: string } }

const syncBody = z.object({ export: z.boolean().default(false) })

export const v1 = new Hono<V1Env>()
  .use(async (c, next) => {
    const header = c.req.header('authorization') ?? ''
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
    const resolved = token ? await resolveProjectToken(db, token) : null
    if (!resolved) throw new HTTPException(401, { message: 'Invalid or missing project token' })
    c.set('ctx', tenantCtx(resolved.tenantId))
    c.set('projectId', resolved.projectId)
    await next()
  })
  .use('/projects/:projectId/*', async (c, next) => {
    if (c.req.param('projectId') !== c.get('projectId'))
      throw new DomainError('not_found', 'Project not found')
    await next()
  })
  .post('/projects/:projectId/sync', async (c) => {
    const ctx = c.get('ctx')
    const projectId = c.get('projectId')
    const body = syncBody.parse(await c.req.json().catch(() => ({})))
    if (!(await getRepoLink(ctx, projectId)))
      throw new DomainError('invalid', 'The project is not connected to a repository')
    const runs = [await queueRun(ctx, projectId, { kind: 'pull', params: { trigger: 'ci', force: true } })]
    if (body.export) runs.push(await queueRun(ctx, projectId, { kind: 'push', params: { trigger: 'ci' } }))
    return c.json({ runs: runs.map(({ id, kind, status }) => ({ id, kind, status })) }, 202)
  })
  .get('/projects/:projectId/runs/:runId', async (c) => {
    const run = await getSyncRun(c.get('ctx'), c.req.param('runId'))
    if (run.projectId !== c.get('projectId')) throw new DomainError('not_found', 'Sync run not found')
    const { id, kind, status, result, error, createdAt, finishedAt } = run
    return c.json({ id, kind, status, result, error, createdAt, finishedAt })
  })
