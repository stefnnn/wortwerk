import { and, desc, eq } from 'drizzle-orm'
import { schema, type Db } from '@wortwerk/db'
import { z } from 'zod'
import { notFound, type Ctx } from './context.ts'
import { randomToken, sha256 } from './secrets.ts'

const { projectToken } = schema

export const tokenInput = z.object({ name: z.string().trim().min(1).max(80) })

export async function listProjectTokens(ctx: Ctx, projectId: string) {
  return ctx.db
    .select({
      id: projectToken.id,
      name: projectToken.name,
      tokenPrefix: projectToken.tokenPrefix,
      lastUsedAt: projectToken.lastUsedAt,
      createdAt: projectToken.createdAt,
    })
    .from(projectToken)
    .where(and(eq(projectToken.tenantId, ctx.tenantId), eq(projectToken.projectId, projectId)))
    .orderBy(desc(projectToken.createdAt))
}

export async function createProjectToken(ctx: Ctx, projectId: string, input: z.input<typeof tokenInput>) {
  const { name } = tokenInput.parse(input)
  const token = `ww_${randomToken()}`
  const [row] = await ctx.db
    .insert(projectToken)
    .values({
      tenantId: ctx.tenantId,
      projectId,
      name,
      tokenHash: sha256(token),
      tokenPrefix: token.slice(0, 10),
      createdById: ctx.userId,
    })
    .returning({ id: projectToken.id, name: projectToken.name, createdAt: projectToken.createdAt })
  return { ...row!, token }
}

export async function revokeProjectToken(ctx: Ctx, projectId: string, tokenId: string) {
  const [row] = await ctx.db
    .delete(projectToken)
    .where(
      and(
        eq(projectToken.tenantId, ctx.tenantId),
        eq(projectToken.projectId, projectId),
        eq(projectToken.id, tokenId),
      ),
    )
    .returning({ id: projectToken.id })
  if (!row) notFound('Token')
}

/** Resolves a bearer token without tenant context; the caller derives the Ctx from the result. */
export async function resolveProjectToken(db: Db, token: string) {
  if (!token.startsWith('ww_')) return null
  const [row] = await db
    .update(projectToken)
    .set({ lastUsedAt: new Date() })
    .where(eq(projectToken.tokenHash, sha256(token)))
    .returning({ tenantId: projectToken.tenantId, projectId: projectToken.projectId })
  return row ?? null
}
