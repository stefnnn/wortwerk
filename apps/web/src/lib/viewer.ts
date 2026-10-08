import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'

export type Viewer = {
  user: { id: string; name: string; email: string; image?: string | null }
  isAdmin: boolean
  tenants: Array<{ id: string; name: string; slug: string; plan: string; role: string }>
}

export const getViewer = createServerFn({ method: 'GET' }).handler(async (): Promise<Viewer | null> => {
  const [{ auth, isAdminUser, db }, { schema }, { eq, asc }] = await Promise.all([
    import('@wortwerk/api'),
    import('@wortwerk/db'),
    import('drizzle-orm'),
  ])
  const session = await auth.api.getSession({ headers: getRequestHeaders() })
  if (!session) return null
  const tenants = await db
    .select({
      id: schema.tenant.id,
      name: schema.tenant.name,
      slug: schema.tenant.slug,
      plan: schema.tenant.plan,
      role: schema.member.role,
    })
    .from(schema.tenant)
    .innerJoin(schema.member, eq(schema.member.organizationId, schema.tenant.id))
    .where(eq(schema.member.userId, session.user.id))
    .orderBy(asc(schema.tenant.name))
  const { id, name, email, image } = session.user
  return { user: { id, name, email, image }, isAdmin: isAdminUser(session.user), tenants }
})
