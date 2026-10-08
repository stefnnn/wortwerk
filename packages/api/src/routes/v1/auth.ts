import type { Context } from 'hono'
import { createMiddleware } from 'hono/factory'
import { HTTPException } from 'hono/http-exception'
import { eq } from 'drizzle-orm'
import {
  DomainError,
  findMembership,
  getProject,
  guestRole,
  loadGuest,
  notFound,
  resolveApiToken,
  resolveProjectToken,
  type Ctx,
  type ProjectDetails,
} from '@wortwerk/core'
import { schema } from '@wortwerk/db'
import { db, tenantCtx } from '../../services.ts'

export type Scope = 'read' | 'write' | 'sync'

export type Principal =
  | { kind: 'project'; tenantId: string; projectId: string }
  | { kind: 'user'; tokenId: string; userId: string; tenantId: string | null; access: 'read' | 'write' }

type Tenant = typeof schema.tenant.$inferSelect

export type V1Env = {
  Variables: {
    principal: Principal
    ctx: Ctx
    tenant: Tenant
    role: string | null
    project: ProjectDetails
  }
}

const scopes = (p: Principal): Scope[] =>
  p.kind === 'project' ? ['read', 'sync'] : p.access === 'read' ? ['read'] : ['read', 'write', 'sync']

export const authenticate = createMiddleware<V1Env>(async (c, next) => {
  const header = c.req.header('authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  const project = token ? await resolveProjectToken(db, token) : null
  const user = token && !project ? await resolveApiToken(db, token) : null
  if (project) c.set('principal', { kind: 'project', ...project })
  else if (user) c.set('principal', { kind: 'user', tokenId: user.id, ...user })
  else
    throw new HTTPException(401, {
      message: 'Invalid or missing token',
      res: new Response(null, { headers: { 'www-authenticate': 'Bearer' } }),
    })
  await next()
})

/** Scope check plus the guest rule: guests only reach routes that opt in (fail-closed). */
export function allow(scope: Scope, options: { guests?: boolean } = {}) {
  return createMiddleware<V1Env>(async (c, next) => {
    if (!scopes(c.get('principal')).includes(scope))
      throw new DomainError('forbidden', `This token does not have ${scope} access`)
    if (c.get('role') === guestRole && !options.guests)
      throw new DomainError('forbidden', 'Guests cannot use this endpoint')
    await next()
  })
}

export const userTokensOnly = createMiddleware<V1Env>(async (c, next) => {
  if (c.get('principal').kind !== 'user')
    throw new DomainError('forbidden', 'This endpoint needs a personal access token')
  await next()
})

async function enter(c: Context<V1Env>, principal: Principal, tenant: Tenant) {
  c.set('tenant', tenant)
  if (principal.kind === 'project') {
    c.set('role', null)
    c.set('ctx', tenantCtx(tenant.id))
    return
  }
  const membership = await findMembership(db, principal.userId, tenant.id)
  if (!membership || (principal.tenantId && principal.tenantId !== tenant.id)) notFound('Workspace')
  const ctx = tenantCtx(tenant.id, principal.userId)
  if (membership.role === guestRole) ctx.guest = await loadGuest(db, tenant.id, principal.userId)
  c.set('role', membership.role)
  c.set('ctx', ctx)
}

export const withWorkspace = createMiddleware<V1Env>(async (c, next) => {
  const principal = c.get('principal')
  if (principal.kind !== 'user')
    throw new DomainError('forbidden', 'This endpoint needs a personal access token')
  const membership = await findMembership(db, principal.userId, c.req.param('workspace') ?? '')
  if (!membership) notFound('Workspace')
  await enter(c, principal, membership.tenant)
  await next()
})

export const withProject = createMiddleware<V1Env>(async (c, next) => {
  const principal = c.get('principal')
  const projectId = c.req.param('projectId') ?? ''
  if (principal.kind === 'project' && principal.projectId !== projectId) notFound('Project')
  const [row] = await db
    .select({ tenant: schema.tenant })
    .from(schema.project)
    .innerJoin(schema.tenant, eq(schema.tenant.id, schema.project.tenantId))
    .where(eq(schema.project.id, projectId))
  if (!row) notFound('Project')
  await enter(c, principal, row.tenant)
  c.set('project', await getProject(c.get('ctx'), { id: projectId }))
  await next()
})
