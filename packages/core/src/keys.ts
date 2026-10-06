import { and, asc, count, eq, ilike, inArray, isNotNull, isNull, or, sql, type SQL } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { schema } from '@wortwerk/db'
import { z } from 'zod'
import { DomainError, notFound, type Ctx } from './context.ts'
import { assertKeyCapacity } from './limits.ts'
import { getProject } from './projects.ts'
import { setTranslation, translationStatuses } from './translations.ts'

const { translationKey, translation, keyComment, keyScreenshot } = schema

export const listKeysInput = z.object({
  locale: z.string(),
  status: z.enum(translationStatuses).optional(),
  search: z.string().trim().max(200).optional(),
  fileId: z.string().optional(),
  obsolete: z.coerce.boolean().default(false),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

export async function listKeys(ctx: Ctx, projectId: string, input: z.input<typeof listKeysInput>) {
  const q = listKeysInput.parse(input)
  const project = await getProject(ctx, { id: projectId })
  const src = alias(translation, 'src')
  const tgt = alias(translation, 'tgt')

  const filters: Array<SQL | undefined> = [
    eq(translationKey.tenantId, ctx.tenantId),
    eq(translationKey.projectId, projectId),
    q.obsolete ? isNotNull(translationKey.obsoleteAt) : isNull(translationKey.obsoleteAt),
    q.fileId ? eq(translationKey.fileId, q.fileId) : undefined,
  ]
  if (q.status === 'untranslated') filters.push(or(isNull(tgt.id), eq(tgt.status, 'untranslated')))
  else if (q.status) filters.push(eq(tgt.status, q.status))
  if (q.search) {
    const pattern = `%${q.search.replace(/[%_\\]/g, '\\$&')}%`
    filters.push(
      or(ilike(translationKey.name, pattern), ilike(src.value, pattern), ilike(tgt.value, pattern)),
    )
  }
  const where = and(...filters)

  const base = ctx.db
    .select({
      id: translationKey.id,
      name: translationKey.name,
      context: translationKey.context,
      description: translationKey.description,
      isPlural: translationKey.isPlural,
      fileId: translationKey.fileId,
      obsoleteAt: translationKey.obsoleteAt,
      source: src.value,
      value: tgt.value,
      status: sql<string>`coalesce(${tgt.status}, 'untranslated')`,
      updatedAt: tgt.updatedAt,
      comments: sql<number>`(select count(*)::int from ${keyComment} where ${keyComment.keyId} = ${translationKey.id})`,
      screenshots: sql<number>`(select count(*)::int from ${keyScreenshot} where ${keyScreenshot.keyId} = ${translationKey.id})`,
    })
    .from(translationKey)
    .leftJoin(src, and(eq(src.keyId, translationKey.id), eq(src.locale, project.sourceLocale)))
    .leftJoin(tgt, and(eq(tgt.keyId, translationKey.id), eq(tgt.locale, q.locale)))
    .where(where)

  const [items, [total]] = await Promise.all([
    base
      .orderBy(asc(translationKey.fileId), asc(translationKey.position), asc(translationKey.name))
      .limit(q.limit)
      .offset(q.offset),
    ctx.db
      .select({ n: count() })
      .from(translationKey)
      .leftJoin(src, and(eq(src.keyId, translationKey.id), eq(src.locale, project.sourceLocale)))
      .leftJoin(tgt, and(eq(tgt.keyId, translationKey.id), eq(tgt.locale, q.locale)))
      .where(where),
  ])
  return { items, total: total?.n ?? 0 }
}

export type KeyListItem = Awaited<ReturnType<typeof listKeys>>['items'][number]

export async function localeStats(ctx: Ctx, projectId: string) {
  const project = await getProject(ctx, { id: projectId })
  const [totals] = await ctx.db
    .select({ n: count() })
    .from(translationKey)
    .where(
      and(
        eq(translationKey.tenantId, ctx.tenantId),
        eq(translationKey.projectId, projectId),
        isNull(translationKey.obsoleteAt),
      ),
    )
  const rows = await ctx.db
    .select({ locale: translation.locale, status: translation.status, n: count() })
    .from(translation)
    .innerJoin(translationKey, eq(translationKey.id, translation.keyId))
    .where(
      and(
        eq(translationKey.tenantId, ctx.tenantId),
        eq(translationKey.projectId, projectId),
        isNull(translationKey.obsoleteAt),
      ),
    )
    .groupBy(translation.locale, translation.status)

  const total = totals?.n ?? 0
  return project.locales.map(({ code }) => {
    const byStatus = Object.fromEntries(rows.filter((r) => r.locale === code).map((r) => [r.status, r.n]))
    const translated = byStatus.translated ?? 0
    const needsReview = byStatus.needs_review ?? 0
    const approved = byStatus.approved ?? 0
    return {
      locale: code,
      total,
      translated,
      needsReview,
      approved,
      untranslated: Math.max(0, total - translated - needsReview - approved),
    }
  })
}

export const createKeyInput = z.object({
  name: z.string().trim().min(1).max(500),
  context: z.string().max(500).default(''),
  description: z.string().max(2000).default(''),
  fileId: z.string().nullable().default(null),
  sourceValue: z.string().max(20_000).default(''),
})

export async function createKey(ctx: Ctx, projectId: string, input: z.input<typeof createKeyInput>) {
  const data = createKeyInput.parse(input)
  const project = await getProject(ctx, { id: projectId })
  await assertKeyCapacity(ctx, 1)
  const [{ max } = { max: 0 }] = await ctx.db
    .select({ max: sql<number>`coalesce(max(${translationKey.position}), -1)::int + 1` })
    .from(translationKey)
    .where(eq(translationKey.projectId, projectId))
  const [key] = await ctx.db
    .insert(translationKey)
    .values({
      tenantId: ctx.tenantId,
      projectId,
      fileId: data.fileId,
      name: data.name,
      context: data.context,
      description: data.description,
      position: max,
    })
    .onConflictDoNothing()
    .returning()
  if (!key) throw new DomainError('conflict', 'A key with this name already exists')
  if (data.sourceValue) await setTranslation(ctx, key.id, project.sourceLocale, { value: data.sourceValue })
  return key
}

export const updateKeyInput = z.object({
  description: z.string().max(2000).optional(),
})

export async function updateKey(ctx: Ctx, keyId: string, input: z.input<typeof updateKeyInput>) {
  const data = updateKeyInput.parse(input)
  const [row] = await ctx.db
    .update(translationKey)
    .set(data)
    .where(and(eq(translationKey.tenantId, ctx.tenantId), eq(translationKey.id, keyId)))
    .returning()
  return row ?? notFound('Key')
}

export async function setKeysObsolete(ctx: Ctx, keyIds: string[], obsolete: boolean) {
  if (!keyIds.length) return
  if (!obsolete) await assertKeyCapacity(ctx, keyIds.length)
  await ctx.db
    .update(translationKey)
    .set({ obsoleteAt: obsolete ? new Date() : null })
    .where(and(eq(translationKey.tenantId, ctx.tenantId), inArray(translationKey.id, keyIds)))
}

export async function purgeObsoleteKeys(ctx: Ctx, projectId: string) {
  const deleted = await ctx.db
    .delete(translationKey)
    .where(
      and(
        eq(translationKey.tenantId, ctx.tenantId),
        eq(translationKey.projectId, projectId),
        isNotNull(translationKey.obsoleteAt),
      ),
    )
    .returning({ id: translationKey.id })
  return deleted.length
}
