import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { count, eq } from 'drizzle-orm'
import { ZodError } from 'zod'
import { DomainError, countActiveKeys, getPlan } from '@wortwerk/core'
import { schema } from '@wortwerk/db'
import { auth } from '../auth.ts'
import { db } from '../services.ts'
import { requireSession, requireTenant, type Env } from './context.ts'
import { comments, keys, projectKeys, screenshots } from './keys.ts'
import { projects } from './projects.ts'

const statusFor = { not_found: 404, conflict: 409, invalid: 400, limit_reached: 402 } as const

const tenant = new Hono<Env>()
  .use(requireSession, requireTenant)
  .get('/', async (c) => {
    const t = c.get('tenant')
    const [members] = await db
      .select({ n: count() })
      .from(schema.member)
      .where(eq(schema.member.organizationId, t.id))
    return c.json({
      ...t,
      plan: getPlan(t.plan),
      usage: { keys: await countActiveKeys(c.get('ctx')), members: members?.n ?? 0 },
    })
  })
  .route('/projects', projects)
  .route('/projects/:project/keys', projectKeys)
  .route('/keys', keys)
  .route('/comments', comments)
  .route('/screenshots', screenshots)

export const api = new Hono<Env>()
  .basePath('/api')
  .on(['GET', 'POST'], '/auth/*', (c) => auth.handler(c.req.raw))
  .get('/health', (c) => c.json({ ok: true }))
  .route('/t/:tenant', tenant)
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
