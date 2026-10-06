import { and, desc, eq } from 'drizzle-orm'
import { schema } from '@wortwerk/db'
import { notFound, type Ctx } from './context.ts'

const { syncRun } = schema

export type SyncRunKind = (typeof schema.syncRunKind.enumValues)[number]

export async function createSyncRun(
  ctx: Ctx,
  projectId: string,
  kind: SyncRunKind,
  params: Record<string, unknown>,
) {
  const [row] = await ctx.db
    .insert(syncRun)
    .values({ tenantId: ctx.tenantId, projectId, kind, params, createdById: ctx.userId })
    .returning()
  return row!
}

export async function getSyncRun(ctx: Ctx, id: string) {
  const row = await ctx.db.query.syncRun.findFirst({
    where: and(eq(syncRun.tenantId, ctx.tenantId), eq(syncRun.id, id)),
  })
  return row ?? notFound('Sync run')
}

export async function listSyncRuns(ctx: Ctx, projectId: string, limit = 20) {
  return ctx.db.query.syncRun.findMany({
    where: and(eq(syncRun.tenantId, ctx.tenantId), eq(syncRun.projectId, projectId)),
    orderBy: desc(syncRun.createdAt),
    limit,
  })
}

export async function startSyncRun(ctx: Ctx, id: string) {
  await ctx.db
    .update(syncRun)
    .set({ status: 'running', startedAt: new Date(), error: null })
    .where(and(eq(syncRun.tenantId, ctx.tenantId), eq(syncRun.id, id)))
}

export async function finishSyncRun(
  ctx: Ctx,
  id: string,
  outcome: { result?: Record<string, unknown>; error?: string },
) {
  await ctx.db
    .update(syncRun)
    .set({
      status: outcome.error ? 'failed' : 'succeeded',
      result: outcome.result ?? null,
      error: outcome.error ?? null,
      finishedAt: new Date(),
    })
    .where(and(eq(syncRun.tenantId, ctx.tenantId), eq(syncRun.id, id)))
}
