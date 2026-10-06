import { createMiddleware } from 'hono/factory'
import { HTTPException } from 'hono/http-exception'
import { and, eq } from 'drizzle-orm'
import { getProject, type Ctx, type ProjectDetails } from '@wortwerk/core'
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
    .select({ tenant: schema.tenant })
    .from(schema.tenant)
    .innerJoin(schema.member, eq(schema.member.organizationId, schema.tenant.id))
    .where(and(eq(schema.tenant.slug, slug ?? ''), eq(schema.member.userId, userId)))
  if (!row) throw new HTTPException(404, { message: 'Workspace not found' })
  c.set('tenant', row.tenant)
  c.set('ctx', tenantCtx(row.tenant.id, userId))
  await next()
})

export const requireProject = createMiddleware<Env>(async (c, next) => {
  c.set('project', await getProject(c.get('ctx'), { slug: c.req.param('project') ?? '' }))
  await next()
})
