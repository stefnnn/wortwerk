import { and, asc, eq } from 'drizzle-orm'
import { schema } from '@wortwerk/db'
import { z } from 'zod'
import type { Ctx } from './context.ts'
import { getKeyInTenant } from './translations.ts'

const { keyComment } = schema

export const commentInput = z.object({ body: z.string().trim().min(1).max(5000) })

export async function listComments(ctx: Ctx, keyId: string) {
  return ctx.db.query.keyComment.findMany({
    where: and(eq(keyComment.tenantId, ctx.tenantId), eq(keyComment.keyId, keyId)),
    with: { user: { columns: { id: true, name: true, email: true } } },
    orderBy: asc(keyComment.createdAt),
  })
}

export async function addComment(ctx: Ctx, keyId: string, input: z.input<typeof commentInput>) {
  const { body } = commentInput.parse(input)
  await getKeyInTenant(ctx, keyId)
  const [row] = await ctx.db
    .insert(keyComment)
    .values({ tenantId: ctx.tenantId, keyId, userId: ctx.userId, body })
    .returning()
  return row!
}

export async function deleteComment(ctx: Ctx, commentId: string) {
  await ctx.db
    .delete(keyComment)
    .where(and(eq(keyComment.tenantId, ctx.tenantId), eq(keyComment.id, commentId)))
}
