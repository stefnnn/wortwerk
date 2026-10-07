import { afterAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { schema } from '@wortwerk/db'
import type { Storage } from '@wortwerk/storage'
import { db, createTenant } from './helpers.ts'
import { adminOverview, deleteUser, setWorkspacePlan } from '../src/admin.ts'
import { createProject } from '../src/projects.ts'

afterAll(() => db.pool.end())

async function own(tenantId: string, userId: string, role = 'owner') {
  await db
    .insert(schema.member)
    .values({ id: crypto.randomUUID(), organizationId: tenantId, userId, role, createdAt: new Date() })
}

describe('admin', () => {
  it('summarizes users, workspaces and projects', async () => {
    const ctx = await createTenant('project')
    await own(ctx.tenantId, ctx.userId!)
    await createProject(ctx, { name: 'App', slug: 'app', sourceLocale: 'en', locales: ['de'] })

    const overview = await adminOverview(db)
    const user = overview.users.find((u) => u.id === ctx.userId)
    expect(user?.workspace).toMatchObject({ id: ctx.tenantId, plan: 'project', projects: 1, members: 1 })
    expect(overview.projects.find((p) => p.workspace.id === ctx.tenantId)).toMatchObject({
      slug: 'app',
      locales: 2,
      keys: 0,
    })
    expect(overview.totals.byPlan.project).toBeGreaterThanOrEqual(1)
  })

  it('changes the plan and rejects unknown plans', async () => {
    const ctx = await createTenant('free')
    await setWorkspacePlan(db, ctx.tenantId, 'agency')
    const [row] = await db.select().from(schema.tenant).where(eq(schema.tenant.id, ctx.tenantId))
    expect(row?.plan).toBe('agency')
    await expect(setWorkspacePlan(db, ctx.tenantId, 'gold')).rejects.toMatchObject({ code: 'invalid' })
    await expect(setWorkspacePlan(db, crypto.randomUUID(), 'free')).rejects.toMatchObject({
      code: 'not_found',
    })
  })

  it('deletes a user with their workspace and screenshot files', async () => {
    const ctx = await createTenant()
    await own(ctx.tenantId, ctx.userId!)
    const p = await createProject(ctx, { name: 'App', slug: 'app', sourceLocale: 'en', locales: [] })
    const [key] = await db
      .insert(schema.translationKey)
      .values({ tenantId: ctx.tenantId, projectId: p.id, name: 'a' })
      .returning()
    await db.insert(schema.keyScreenshot).values({
      tenantId: ctx.tenantId,
      keyId: key!.id,
      storageKey: 'tenants/x/screenshots/1',
      filename: 'a.png',
      mimeType: 'image/png',
      size: 1,
    })
    const deleted: string[] = []
    const storage = { delete: async (k: string) => void deleted.push(k) } as unknown as Storage

    await deleteUser(db, storage, ctx.userId!, 'someone-else')

    expect(await db.select().from(schema.user).where(eq(schema.user.id, ctx.userId!))).toHaveLength(0)
    expect(await db.select().from(schema.tenant).where(eq(schema.tenant.id, ctx.tenantId))).toHaveLength(0)
    expect(deleted).toEqual(['tenants/x/screenshots/1'])
  })

  it('refuses to delete yourself or an owner whose workspace has other members', async () => {
    const ctx = await createTenant()
    await own(ctx.tenantId, ctx.userId!)
    const colleague = crypto.randomUUID()
    await db.insert(schema.user).values({ id: colleague, name: 'Bob', email: `${colleague}@example.com` })
    await own(ctx.tenantId, colleague, 'member')

    await expect(deleteUser(db, undefined, ctx.userId!, ctx.userId!)).rejects.toMatchObject({
      code: 'invalid',
    })
    await expect(deleteUser(db, undefined, ctx.userId!, 'someone-else')).rejects.toMatchObject({
      code: 'conflict',
    })
    // a plain member can be deleted, the workspace stays
    await deleteUser(db, undefined, colleague, 'someone-else')
    expect(await db.select().from(schema.tenant).where(eq(schema.tenant.id, ctx.tenantId))).toHaveLength(1)
  })
})
