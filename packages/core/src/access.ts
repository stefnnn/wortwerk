import { and, eq, inArray } from 'drizzle-orm'
import { schema, type DbOrTx } from '@wortwerk/db'
import { z } from 'zod'
import { DomainError, assertMember, type Ctx, type Guest } from './context.ts'
import { localeCode } from './projects.ts'

const { member, project, projectLocale, projectMember } = schema

export const guestRole = 'guest'

export const grantsInput = z
  .array(z.object({ projectId: z.string().min(1), locales: z.array(localeCode).min(1).nullable() }))
  .min(1, 'Select at least one project')
  .max(200)
export type Grants = z.infer<typeof grantsInput>

export async function loadGuest(db: DbOrTx, tenantId: string, userId: string): Promise<Guest> {
  const rows = await db
    .select({ projectId: projectMember.projectId, locales: projectMember.locales })
    .from(projectMember)
    .where(and(eq(projectMember.tenantId, tenantId), eq(projectMember.userId, userId)))
  return new Map(rows.map((r) => [r.projectId, r.locales]))
}

/** Checks that every grant points at a project of this tenant and only lists locales the project has. */
export async function validateGrants(db: DbOrTx, tenantId: string, input: unknown): Promise<Grants> {
  const parsed = grantsInput.safeParse(input)
  if (!parsed.success) throw new DomainError('invalid', parsed.error.issues[0]?.message ?? 'Invalid access')
  const grants = parsed.data
  if (new Set(grants.map((g) => g.projectId)).size !== grants.length)
    throw new DomainError('invalid', 'A project can only be listed once')
  const locales = await db
    .select({ projectId: projectLocale.projectId, code: projectLocale.code })
    .from(projectLocale)
    .innerJoin(project, eq(project.id, projectLocale.projectId))
    .where(
      and(
        eq(project.tenantId, tenantId),
        inArray(
          projectLocale.projectId,
          grants.map((g) => g.projectId),
        ),
      ),
    )
  const byProject = new Map<string, Set<string>>()
  for (const l of locales) byProject.set(l.projectId, (byProject.get(l.projectId) ?? new Set()).add(l.code))
  for (const g of grants) {
    const known = byProject.get(g.projectId)
    if (!known) throw new DomainError('invalid', 'Project not found')
    const unknown = g.locales?.find((code) => !known.has(code))
    if (unknown) throw new DomainError('invalid', `Locale ${unknown} is not part of the project`)
  }
  return grants
}

export function parseGrants(json: string | null | undefined): unknown {
  try {
    return json ? JSON.parse(json) : null
  } catch {
    return null
  }
}

/** Replaces all project grants of a user in a tenant. */
export async function replaceGrants(db: DbOrTx, tenantId: string, userId: string, grants: Grants) {
  await db
    .delete(projectMember)
    .where(and(eq(projectMember.tenantId, tenantId), eq(projectMember.userId, userId)))
  await db
    .insert(projectMember)
    .values(grants.map((g) => ({ tenantId, userId, projectId: g.projectId, locales: g.locales })))
}

export async function removeGrants(db: DbOrTx, tenantId: string, userId: string) {
  await db
    .delete(projectMember)
    .where(and(eq(projectMember.tenantId, tenantId), eq(projectMember.userId, userId)))
}

export async function listGuestAccess(ctx: Ctx) {
  assertMember(ctx)
  return ctx.db
    .select({
      userId: projectMember.userId,
      projectId: projectMember.projectId,
      locales: projectMember.locales,
    })
    .from(projectMember)
    .where(eq(projectMember.tenantId, ctx.tenantId))
}

export async function setGuestAccess(ctx: Ctx, userId: string, input: unknown) {
  assertMember(ctx)
  const [row] = await ctx.db
    .select({ role: member.role })
    .from(member)
    .where(and(eq(member.organizationId, ctx.tenantId), eq(member.userId, userId)))
  if (row?.role !== guestRole) throw new DomainError('not_found', 'Guest not found')
  const grants = await validateGrants(ctx.db, ctx.tenantId, input)
  await ctx.db.transaction((tx) => replaceGrants(tx, ctx.tenantId, userId, grants))
}
