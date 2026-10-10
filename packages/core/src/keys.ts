import {
  and,
  asc,
  count,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  ne,
  notInArray,
  or,
  sql,
  type SQL,
} from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { schema } from '@wortwerk/db'
import { z } from 'zod'
import { DomainError, assertLocaleEditable, chunks, notFound, type Ctx } from './context.ts'
import { assertKeyCapacity } from './limits.ts'
import { getProject } from './projects.ts'
import { setTranslation, translationStatuses, type TranslationStatus } from './translations.ts'

const {
  translationKey,
  translation,
  projectLocale,
  translationRevision,
  keyComment,
  keyScreenshot,
  sourceConflict,
  projectRepo,
} = schema

export const ALL_LOCALES = 'all'

export const listKeysInput = z.object({
  // a locale code, or ALL_LOCALES for one row per key and target locale
  locale: z.string(),
  // The editor can opt in to showing the source alongside target rows.
  includeSource: z.coerce.boolean().default(false),
  status: z.enum(translationStatuses).optional(),
  // source sync state: wording not in the repo yet, or an open conflict with the repo
  sync: z.enum(['pending', 'conflict']).optional(),
  search: z.string().trim().max(200).optional(),
  // exact key name, for API clients that address keys by name
  name: z.string().max(500).optional(),
  fileId: z.string().optional(),
  obsolete: z.coerce.boolean().default(false),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

const openConflict = sql`(select 1 from ${sourceConflict} where ${sourceConflict.keyId} = ${translationKey.id} and ${sourceConflict.resolvedAt} is null)`

export const keyFilterInput = listKeysInput.omit({ limit: true, offset: true })

function keyFilter(
  ctx: Ctx,
  project: { id: string; sourceLocale: string },
  input: z.input<typeof keyFilterInput>,
) {
  const q = keyFilterInput.parse(input)
  const src = alias(translation, 'src')
  const tgt = alias(translation, 'tgt')

  const filters: Array<SQL | undefined> = [
    eq(translationKey.tenantId, ctx.tenantId),
    eq(translationKey.projectId, project.id),
    // conflicts include keys the repo removed, so they show regardless of the obsolete filter
    q.sync === 'conflict'
      ? undefined
      : q.obsolete
        ? isNotNull(translationKey.obsoleteAt)
        : isNull(translationKey.obsoleteAt),
    q.fileId ? eq(translationKey.fileId, q.fileId) : undefined,
    q.name !== undefined ? eq(translationKey.name, q.name) : undefined,
  ]
  if (q.status === 'untranslated') filters.push(or(isNull(tgt.id), eq(tgt.status, 'untranslated')))
  else if (q.status) filters.push(eq(tgt.status, q.status))
  if (q.sync === 'pending') filters.push(isNotNull(src.repoValue), sql`${src.value} <> ${src.repoValue}`)
  if (q.sync === 'conflict') filters.push(sql`exists ${openConflict}`)
  if (q.search) {
    const pattern = `%${q.search.replace(/[%_\\]/g, '\\$&')}%`
    filters.push(
      or(ilike(translationKey.name, pattern), ilike(src.value, pattern), ilike(tgt.value, pattern)),
    )
  }
  return { q, src, tgt, where: and(...filters) }
}

export async function listKeys(ctx: Ctx, projectId: string, input: z.input<typeof listKeysInput>) {
  const q = listKeysInput.parse(input)
  const project = await getProject(ctx, { id: projectId })
  const { src, tgt, where } = keyFilter(ctx, project, q)

  // one row per key and listed locale: the requested one, or every target locale (optionally including source)
  const localeRows = and(
    eq(projectLocale.projectId, translationKey.projectId),
    q.locale === ALL_LOCALES
      ? q.includeSource
        ? undefined
        : ne(projectLocale.code, project.sourceLocale)
      : eq(projectLocale.code, q.locale),
  )
  const [items, [total]] = await Promise.all([
    ctx.db
      .select({
        id: translationKey.id,
        locale: projectLocale.code,
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
        repoValue: src.repoValue,
        conflict: sql<boolean>`exists ${openConflict}`,
        comments: sql<number>`(select count(*)::int from ${keyComment} where ${keyComment.keyId} = ${translationKey.id})`,
        screenshots: sql<number>`(select count(*)::int from ${keyScreenshot} where ${keyScreenshot.keyId} = ${translationKey.id})`,
      })
      .from(translationKey)
      .innerJoin(projectLocale, localeRows)
      .leftJoin(src, and(eq(src.keyId, translationKey.id), eq(src.locale, project.sourceLocale)))
      .leftJoin(tgt, and(eq(tgt.keyId, translationKey.id), eq(tgt.locale, projectLocale.code)))
      .where(where)
      .orderBy(
        asc(translationKey.fileId),
        asc(translationKey.position),
        asc(translationKey.name),
        asc(projectLocale.code),
      )
      .limit(q.limit)
      .offset(q.offset),
    ctx.db
      .select({ n: count() })
      .from(translationKey)
      .innerJoin(projectLocale, localeRows)
      .leftJoin(src, and(eq(src.keyId, translationKey.id), eq(src.locale, project.sourceLocale)))
      .leftJoin(tgt, and(eq(tgt.keyId, translationKey.id), eq(tgt.locale, projectLocale.code)))
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
  const [linked] = await ctx.db
    .select({ id: projectRepo.id })
    .from(projectRepo)
    .where(and(eq(projectRepo.tenantId, ctx.tenantId), eq(projectRepo.projectId, project.id)))
  if (linked)
    throw new DomainError(
      'invalid',
      'Keys of a project connected to a repository are added in the repository',
    )
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

/** All key ids of a project, obsolete ones included: diffing two snapshots yields the keys a sync or import added. */
export async function projectKeyIds(ctx: Ctx, projectId: string) {
  const rows = await ctx.db
    .select({ id: translationKey.id })
    .from(translationKey)
    .where(and(eq(translationKey.tenantId, ctx.tenantId), eq(translationKey.projectId, projectId)))
  return new Set(rows.map((r) => r.id))
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

export const keySelection = z.union([
  z.object({ keyIds: z.array(z.string()).min(1).max(1000) }),
  // everything matching the filter, minus the rows the user unticked
  z.object({ filter: keyFilterInput, excludeKeyIds: z.array(z.string()).max(1000).default([]) }),
])
export type KeySelection = z.input<typeof keySelection>

const rowRef = z.object({ keyId: z.string(), locale: z.string() })

/** A selection in the "all languages" list, whose rows are a key in one locale. */
export const allSelection = z.union([
  z.object({ rows: z.array(rowRef).min(1).max(1000) }),
  z.object({ filter: keyFilterInput, excludeRows: z.array(rowRef).max(1000).default([]) }),
])

/**
 * Splits a selection into one per locale, so bulk actions can reuse the single-locale code. `locale` is the
 * list the selection was made in: a locale code, or ALL_LOCALES.
 */
export async function splitSelection(
  ctx: Ctx,
  projectId: string,
  locale: string,
  input: unknown,
): Promise<Array<{ locale: string; selection: KeySelection }>> {
  if (locale !== ALL_LOCALES) return [{ locale, selection: keySelection.parse(input) }]
  const selection = allSelection.parse(input)
  const project = await getProject(ctx, { id: projectId })
  if ('rows' in selection) {
    const byLocale = new Map<string, string[]>()
    for (const r of selection.rows) {
      if (r.locale === project.sourceLocale) continue
      byLocale.set(r.locale, [...(byLocale.get(r.locale) ?? []), r.keyId])
    }
    return [...byLocale].map(([code, keyIds]) => ({ locale: code, selection: { keyIds } }))
  }
  return project.locales
    .filter((l) => l.code !== project.sourceLocale)
    .map(({ code }) => ({
      locale: code,
      selection: {
        filter: { ...selection.filter, locale: code },
        excludeKeyIds: selection.excludeRows.filter((r) => r.locale === code).map((r) => r.keyId),
      },
    }))
}

export async function resolveKeySelection(ctx: Ctx, projectId: string, input: KeySelection) {
  const selection = keySelection.parse(input)
  const project = await getProject(ctx, { id: projectId })
  if ('keyIds' in selection) {
    const rows = await ctx.db
      .select({ id: translationKey.id })
      .from(translationKey)
      .where(
        and(
          eq(translationKey.tenantId, ctx.tenantId),
          eq(translationKey.projectId, project.id),
          inArray(translationKey.id, selection.keyIds),
        ),
      )
    return rows.map((r) => r.id)
  }
  const { src, tgt, where, q } = keyFilter(ctx, project, selection.filter)
  const rows = await ctx.db
    .select({ id: translationKey.id })
    .from(translationKey)
    .leftJoin(src, and(eq(src.keyId, translationKey.id), eq(src.locale, project.sourceLocale)))
    .leftJoin(tgt, and(eq(tgt.keyId, translationKey.id), eq(tgt.locale, q.locale)))
    .where(
      and(
        where,
        selection.excludeKeyIds.length ? notInArray(translationKey.id, selection.excludeKeyIds) : undefined,
      ),
    )
    .orderBy(asc(translationKey.fileId), asc(translationKey.position), asc(translationKey.name))
  return rows.map((r) => r.id)
}

export const bulkStatuses = ['translated', 'needs_review', 'approved'] as const

/** Sets the review status of existing, non-empty translations. Keys without a translation are skipped. */
export async function setTranslationStatusBulk(
  ctx: Ctx,
  projectId: string,
  locale: string,
  status: (typeof bulkStatuses)[number],
  selection: KeySelection,
) {
  const project = await getProject(ctx, { id: projectId })
  if (!project.locales.some((l) => l.code === locale))
    throw new DomainError('invalid', `Locale ${locale} is not part of this project`)
  assertLocaleEditable(ctx, projectId, locale)
  const keyIds = await resolveKeySelection(ctx, projectId, selection)
  let updated = 0
  for (const batch of chunks(keyIds)) {
    await ctx.db.transaction(async (tx) => {
      const rows = await tx
        .update(translation)
        .set({ status: status satisfies TranslationStatus, updatedById: ctx.userId, updatedAt: new Date() })
        .where(
          and(
            eq(translation.tenantId, ctx.tenantId),
            eq(translation.locale, locale),
            inArray(translation.keyId, batch),
            sql`${translation.value} <> ''`,
            sql`${translation.status} <> ${status}`,
          ),
        )
        .returning({ id: translation.id, value: translation.value })
      if (rows.length)
        await tx.insert(translationRevision).values(
          rows.map((r) => ({
            tenantId: ctx.tenantId,
            translationId: r.id,
            value: r.value,
            status,
            source: 'editor' as const,
            userId: ctx.userId,
          })),
        )
      updated += rows.length
    })
  }
  return { selected: keyIds.length, updated }
}

export async function sourceSyncCounts(ctx: Ctx, projectId: string) {
  const project = await getProject(ctx, { id: projectId })
  const [row] = await ctx.db
    .select({
      pending: sql<number>`count(*) filter (where ${translation.repoValue} is not null and ${translation.value} <> ${translation.repoValue} and ${translationKey.obsoleteAt} is null)::int`,
      conflicts: sql<number>`count(*) filter (where exists ${openConflict})::int`,
    })
    .from(translationKey)
    .leftJoin(
      translation,
      and(eq(translation.keyId, translationKey.id), eq(translation.locale, project.sourceLocale)),
    )
    .where(and(eq(translationKey.tenantId, ctx.tenantId), eq(translationKey.projectId, project.id)))
  return { pending: row?.pending ?? 0, conflicts: row?.conflicts ?? 0 }
}
