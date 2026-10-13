import { and, count, eq, inArray, isNull, ne } from 'drizzle-orm'
import { schema, type DbOrTx } from '@wortwerk/db'
import type { Storage } from '@wortwerk/storage'
import { DomainError, notFound } from './context.ts'
import { planIds } from './plans.ts'

// Platform administration works across tenants, so unlike the rest of core it takes a bare
// `db` instead of a `Ctx`. Callers must have verified that the viewer is a platform admin.

const { user, tenant, member, project, projectLocale, projectRepo, translationKey, keyScreenshot } = schema

export type AdminWorkspace = {
  id: string
  name: string
  slug: string
  plan: string
  projects: number
  keys: number
  members: number
}

export type AdminUser = {
  id: string
  name: string
  email: string
  emailVerified: boolean
  createdAt: Date
  workspace: AdminWorkspace | null
  memberships: number
}

export type AdminProject = {
  id: string
  name: string
  slug: string
  sourceLocale: string
  locales: number
  keys: number
  repo: string | null
  lastPulledAt: Date | null
  createdAt: Date
  workspace: { id: string; name: string; slug: string; plan: string }
}

export async function adminOverview(db: DbOrTx) {
  const [users, tenants, memberships, projectCounts, keyCounts, memberCounts] = await Promise.all([
    db.select().from(user),
    db.select().from(tenant),
    db.select({ userId: member.userId, tenantId: member.organizationId, role: member.role }).from(member),
    db.select({ tenantId: project.tenantId, n: count() }).from(project).groupBy(project.tenantId),
    db
      .select({ tenantId: translationKey.tenantId, n: count() })
      .from(translationKey)
      .where(isNull(translationKey.obsoleteAt))
      .groupBy(translationKey.tenantId),
    db.select({ tenantId: member.organizationId, n: count() }).from(member).groupBy(member.organizationId),
  ])

  const tally = (rows: Array<{ tenantId: string; n: number }>) => new Map(rows.map((r) => [r.tenantId, r.n]))
  const projectsBy = tally(projectCounts)
  const keysBy = tally(keyCounts)
  const membersBy = tally(memberCounts)

  const workspaces = new Map<string, AdminWorkspace>(
    tenants.map((t) => [
      t.id,
      {
        id: t.id,
        name: t.name,
        slug: t.slug,
        plan: t.plan,
        projects: projectsBy.get(t.id) ?? 0,
        keys: keysBy.get(t.id) ?? 0,
        members: membersBy.get(t.id) ?? 0,
      },
    ]),
  )

  const adminUsers: AdminUser[] = users
    .map((u) => {
      const own = memberships.filter((m) => m.userId === u.id)
      const owned = own.find((m) => m.role === 'owner')
      return {
        id: u.id,
        name: u.name,
        email: u.email,
        emailVerified: u.emailVerified,
        createdAt: u.createdAt,
        workspace: (owned && workspaces.get(owned.tenantId)) || null,
        memberships: own.length,
      }
    })
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())

  const projectRows = await db
    .select({
      id: project.id,
      name: project.name,
      slug: project.slug,
      sourceLocale: project.sourceLocale,
      createdAt: project.createdAt,
      tenantId: project.tenantId,
      repo: projectRepo.repo,
      lastPulledAt: projectRepo.lastPulledAt,
    })
    .from(project)
    .leftJoin(projectRepo, eq(projectRepo.projectId, project.id))
  const [projectKeyCounts, localeCounts] = await Promise.all([
    db
      .select({ projectId: translationKey.projectId, n: count() })
      .from(translationKey)
      .where(isNull(translationKey.obsoleteAt))
      .groupBy(translationKey.projectId),
    db
      .select({ projectId: projectLocale.projectId, n: count() })
      .from(projectLocale)
      .groupBy(projectLocale.projectId),
  ])
  const projectKeys = new Map(projectKeyCounts.map((r) => [r.projectId, r.n]))
  const projectLocales = new Map(localeCounts.map((r) => [r.projectId, r.n]))

  const adminProjects: AdminProject[] = projectRows
    .flatMap((p) => {
      const w = workspaces.get(p.tenantId)
      if (!w) return []
      return [
        {
          id: p.id,
          name: p.name,
          slug: p.slug,
          sourceLocale: p.sourceLocale,
          locales: projectLocales.get(p.id) ?? 0,
          keys: projectKeys.get(p.id) ?? 0,
          repo: p.repo,
          lastPulledAt: p.lastPulledAt,
          createdAt: p.createdAt,
          workspace: { id: w.id, name: w.name, slug: w.slug, plan: w.plan },
        },
      ]
    })
    .sort((a, b) => b.keys - a.keys)

  const byPlan = Object.fromEntries(planIds.map((id) => [id, 0])) as Record<string, number>
  for (const w of workspaces.values()) byPlan[w.plan] = (byPlan[w.plan] ?? 0) + 1

  return {
    totals: {
      users: users.length,
      workspaces: workspaces.size,
      projects: projectRows.length,
      keys: [...keysBy.values()].reduce((a, b) => a + b, 0),
      byPlan,
    },
    users: adminUsers,
    projects: adminProjects,
  }
}

export async function setWorkspacePlan(db: DbOrTx, tenantId: string, plan: string) {
  if (!(planIds as readonly string[]).includes(plan)) throw new DomainError('invalid', `Unknown plan ${plan}`)
  const [row] = await db
    .update(tenant)
    .set({ plan })
    .where(eq(tenant.id, tenantId))
    .returning({ id: tenant.id })
  if (!row) notFound('Workspace')
}

/**
 * Deletes a user together with the workspace they own (projects, keys, translations, history).
 * Refuses if that workspace has other members or if the user is the acting admin.
 */
export async function deleteUser(
  db: DbOrTx,
  storage: Storage | undefined,
  userId: string,
  actingUserId: string,
) {
  if (userId === actingUserId) throw new DomainError('invalid', 'You cannot delete your own account')

  const storageKeys = await db.transaction(async (tx) => {
    const [target] = await tx.select({ id: user.id }).from(user).where(eq(user.id, userId))
    if (!target) notFound('User')

    const owned = await tx
      .select({ id: member.organizationId })
      .from(member)
      .where(and(eq(member.userId, userId), eq(member.role, 'owner')))
    const ownedIds = owned.map((o) => o.id)

    let keys: string[] = []
    if (ownedIds.length) {
      const [{ n } = { n: 0 }] = await tx
        .select({ n: count() })
        .from(member)
        .where(and(inArray(member.organizationId, ownedIds), ne(member.userId, userId)))
      if (n > 0)
        throw new DomainError('conflict', 'The user’s workspace has other members. Remove them first.')
      keys = (
        await tx
          .select({ key: keyScreenshot.storageKey })
          .from(keyScreenshot)
          .where(inArray(keyScreenshot.tenantId, ownedIds))
      ).map((r) => r.key)
      await tx.delete(tenant).where(inArray(tenant.id, ownedIds))
    }
    await tx.delete(user).where(eq(user.id, userId))
    return keys
  })

  // storage cleanup is best effort, the rows are already gone
  await Promise.all(storageKeys.map((key) => storage?.delete(key).catch(() => undefined)))
}
