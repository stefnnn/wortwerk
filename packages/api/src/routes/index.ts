import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { ZodError, z } from 'zod'
import { validate } from './validate.ts'
import { DomainError, listGuestAccess, setGuestAccess } from '@wortwerk/core'
import { auth } from '../auth.ts'
import { env } from '../env.ts'
import { admin } from './admin.ts'
import { requireSession, requireTenant, type Env } from './context.ts'
import { comments, keys, projectKeys, screenshots } from './keys.ts'
import { integrations, tenantGit, webhooks } from './git.ts'
import { projects } from './projects.ts'
import { v1 } from './v1/index.ts'
import { account } from './account.ts'
import { workspaceSummary } from './workspace.ts'

const statusFor = { not_found: 404, conflict: 409, invalid: 400, limit_reached: 402, forbidden: 403 } as const

const tenant = new Hono<Env>()
  .use(requireSession, requireTenant)
  .get('/', async (c) => {
    const t = c.get('tenant')
    return c.json({
      ...t,
      ...(await workspaceSummary(c.get('ctx'), t.plan)),
      contact: env.ADMIN_EMAIL ?? null,
    })
  })
  .route('/projects', projects)
  .route('/git', tenantGit)
  .get('/access', async (c) => c.json(await listGuestAccess(c.get('ctx'))))
  .put('/access/:userId', validate('json', z.object({ grants: z.unknown() })), async (c) => {
    await setGuestAccess(c.get('ctx'), c.req.param('userId'), c.req.valid('json').grants)
    return c.body(null, 204)
  })
  .route('/projects/:project/keys', projectKeys)
  .route('/keys', keys)
  .route('/comments', comments)
  .route('/screenshots', screenshots)

export const api = new Hono<Env>()
  .basePath('/api')
  .on(['GET', 'POST'], '/auth/*', (c) => auth.handler(c.req.raw))
  .get('/health', (c) => c.json({ ok: true }))
  .route('/t/:tenant', tenant)
  .route('/admin', admin)
  .route('/webhooks', webhooks)
  .route('/integrations', integrations)
  .route('/account', account)
  .route('/v1', v1)
  .onError((error, c) => {
    if (error instanceof DomainError)
      return c.json({ error: error.code, message: error.message }, statusFor[error.code])
    if (error instanceof ZodError)
      return c.json({ error: 'invalid', message: error.issues[0]?.message ?? 'Invalid input' }, 400)
    if (error instanceof HTTPException) return c.json({ error: 'http', message: error.message }, error.status)
    console.error(error)
    return c.json({ error: 'internal', message: 'Something went wrong' }, 500)
  })

export type Api = typeof api
