import { createMiddleware } from 'hono/factory'
import { HTTPException } from 'hono/http-exception'
import { and, eq } from 'drizzle-orm'
import { DomainError, getProject, guestRole, loadGuest, type Ctx, type ProjectDetails } from '@wortwerk/core'
import { schema } from '@wortwerk/db'
import { auth, type Session } from '../auth.ts'
import { db, tenantCtx } from '../services.ts'

export type Env = {
  Variables: {
    session: Session
    ctx: Ctx
    tenant: typeof schema.tenant.$inferSelect
    project: ProjectDetails
  }
}

export const requireSession = createMiddleware<Env>(async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  if (!session) throw new HTTPException(401, { message: 'Not signed in' })
  c.set('session', session)
  await next()
})

export const requireTenant = createMiddleware<Env>(async (c, next) => {
  const slug = c.req.param('tenant')
  const userId = c.get('session').user.id
  const [row] = await db
    .select({ tenant: schema.tenant, role: schema.member.role })
    .from(schema.tenant)
    .innerJoin(schema.member, eq(schema.member.organizationId, schema.tenant.id))
    .where(and(eq(schema.tenant.slug, slug ?? ''), eq(schema.member.userId, userId)))
  if (!row) throw new HTTPException(404, { message: 'Workspace not found' })
  c.set('tenant', row.tenant)
  const ctx = tenantCtx(row.tenant.id, userId)
  if (row.role === guestRole) {
    const path = c.req.path.replace(/^\/api\/t\/[^/]+/, '')
    if (!guestMayCall(c.req.method, path)) throw new DomainError('forbidden', 'Guests cannot change settings')
    ctx.guest = await loadGuest(db, row.tenant.id, userId)
  }
  c.set('ctx', ctx)
  await next()
})

// Guests edit content and nothing else. This is the whole list of what they may call (fail-closed: a new
// route is members-only until it is added here). Project and locale scoping happens in @wortwerk/core.
const guestRoutes: Array<[method: string, path: RegExp]> = [
  ['GET', /^\/?$/],
  ['GET', /^\/projects$/],
  ['GET', /^\/projects\/[^/]+$/],
  ['GET', /^\/projects\/[^/]+\/stats$/],
  ['GET', /^\/projects\/[^/]+\/keys$/],
  ['POST', /^\/projects\/[^/]+\/keys\/status$/],
  ['PUT', /^\/keys\/[^/]+\/translations\/[^/]+$/],
  ['GET', /^\/keys\/[^/]+\/translations\/[^/]+\/revisions$/],
  ['GET', /^\/keys\/[^/]+\/suggestions$/],
  ['POST', /^\/keys\/[^/]+\/machine$/],
  ['GET', /^\/keys\/[^/]+\/(comments|screenshots)$/],
  ['POST', /^\/keys\/[^/]+\/(comments|screenshots)$/],
  ['DELETE', /^\/comments\/[^/]+$/],
  ['GET', /^\/screenshots\/[^/]+$/],
  ['DELETE', /^\/screenshots\/[^/]+$/],
]

export function guestMayCall(method: string, path: string) {
  return guestRoutes.some(([m, re]) => m === method && re.test(path))
}

export const requireProject = createMiddleware<Env>(async (c, next) => {
  c.set('project', await getProject(c.get('ctx'), { slug: c.req.param('project') ?? '' }))
  await next()
})
