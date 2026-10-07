import { and, desc, eq, inArray, isNull, ne } from 'drizzle-orm'
import { schema } from '@wortwerk/db'
import { describeStructureIssue, parsePluralIcu, structureIssue, validateIcu } from '@wortwerk/formats'
import { z } from 'zod'
import { DomainError, notFound, type Ctx } from './context.ts'

const { translation, translationRevision, translationKey, sourceConflict } = schema

export const translationStatuses = ['untranslated', 'translated', 'needs_review', 'approved'] as const
export type TranslationStatus = (typeof translationStatuses)[number]
export type RevisionSource = (typeof schema.revisionSource.enumValues)[number]

export const setTranslationInput = z.object({
  value: z.string().max(20_000),
  status: z.enum(translationStatuses).optional(),
  // source edits only: a typo fix that should not send translations back to review
  minor: z.boolean().optional(),
})

export async function getKeyInTenant(ctx: Ctx, keyId: string) {
  const key = await ctx.db.query.translationKey.findFirst({
    where: and(eq(translationKey.tenantId, ctx.tenantId), eq(translationKey.id, keyId)),
    with: {
      project: { columns: { id: true, sourceLocale: true }, with: { locales: { columns: { code: true } } } },
    },
  })
  return key ?? notFound('Key')
}

export async function setTranslation(
  ctx: Ctx,
  keyId: string,
  locale: string,
  input: z.input<typeof setTranslationInput>,
  source: RevisionSource = 'editor',
) {
  const data = setTranslationInput.parse(input)
  const key = await getKeyInTenant(ctx, keyId)
  if (!key.project.locales.some((l) => l.code === locale))
    throw new DomainError('invalid', `Locale ${locale} is not part of this project`)
  const issue = data.value ? validateIcu(data.value) : null
  if (issue) throw new DomainError('invalid', `Invalid ICU message: ${issue.message}`)

  const isSource = key.project.sourceLocale === locale
  const status: TranslationStatus = !data.value
    ? 'untranslated'
    : (data.status ?? (isSource ? 'approved' : 'translated'))

  return ctx.db.transaction(async (tx) => {
    const existing = await tx.query.translation.findFirst({
      where: and(eq(translation.keyId, keyId), eq(translation.locale, locale)),
    })
    if (existing && existing.value === data.value && existing.status === status) return existing
    // source text that came from the repo: wording is editable, structure belongs to the developers
    if (isSource && existing?.repoValue != null) {
      if (!data.value) throw new DomainError('invalid', 'Source text from the repository cannot be emptied')
      const changed = structureIssue(existing.repoValue, data.value, locale, 'source')
      if (changed) {
        throw new DomainError(
          'invalid',
          `Placeholders, markup and plural forms are defined in the repository (${describeStructureIssue(changed)})`,
        )
      }
    }

    const [row] = await tx
      .insert(translation)
      .values({ tenantId: ctx.tenantId, keyId, locale, value: data.value, status, updatedById: ctx.userId })
      .onConflictDoUpdate({
        target: [translation.keyId, translation.locale],
        set: { value: data.value, status, updatedById: ctx.userId, updatedAt: new Date() },
      })
      .returning()

    await tx.insert(translationRevision).values({
      tenantId: ctx.tenantId,
      translationId: row!.id,
      value: data.value,
      status,
      source,
      userId: ctx.userId,
    })

    if (isSource) {
      const isPlural = parsePluralIcu(data.value) !== null
      if (isPlural !== key.isPlural)
        await tx.update(translationKey).set({ isPlural }).where(eq(translationKey.id, keyId))
      if (existing && existing.value !== data.value && !data.minor)
        await flagDependentsForReview(tx, ctx.tenantId, [keyId], locale)
      if (source === 'editor') await resolveConflicts(tx, ctx, [keyId], 'edited')
    }
    return row!
  })
}

export async function flagDependentsForReview(
  db: Ctx['db'],
  tenantId: string,
  keyIds: string[],
  sourceLocale: string,
) {
  if (!keyIds.length) return
  await db
    .update(translation)
    .set({ status: 'needs_review', updatedAt: new Date() })
    .where(
      and(
        eq(translation.tenantId, tenantId),
        inArray(translation.keyId, keyIds),
        ne(translation.locale, sourceLocale),
        inArray(translation.status, ['translated', 'approved']),
      ),
    )
}

export async function setTranslationStatus(
  ctx: Ctx,
  keyId: string,
  locale: string,
  status: TranslationStatus,
) {
  const existing = await ctx.db.query.translation.findFirst({
    where: and(
      eq(translation.tenantId, ctx.tenantId),
      eq(translation.keyId, keyId),
      eq(translation.locale, locale),
    ),
  })
  if (!existing) throw new DomainError('invalid', 'Translate the key before changing its status')
  return setTranslation(ctx, keyId, locale, { value: existing.value, status })
}

export async function listRevisions(ctx: Ctx, keyId: string, locale: string) {
  const row = await ctx.db.query.translation.findFirst({
    where: and(
      eq(translation.tenantId, ctx.tenantId),
      eq(translation.keyId, keyId),
      eq(translation.locale, locale),
    ),
    columns: { id: true },
  })
  if (!row) return []
  return ctx.db.query.translationRevision.findMany({
    where: eq(translationRevision.translationId, row.id),
    with: { user: { columns: { id: true, name: true, email: true } } },
    orderBy: desc(translationRevision.createdAt),
    limit: 100,
  })
}

export async function resolveConflicts(
  db: Ctx['db'],
  ctx: Ctx,
  keyIds: string[],
  resolution: 'repo' | 'edited',
) {
  if (!keyIds.length) return 0
  const rows = await db
    .update(sourceConflict)
    .set({ resolvedAt: new Date(), resolvedById: ctx.userId, resolution })
    .where(
      and(
        eq(sourceConflict.tenantId, ctx.tenantId),
        inArray(sourceConflict.keyId, keyIds),
        isNull(sourceConflict.resolvedAt),
      ),
    )
    .returning({ id: sourceConflict.id })
  return rows.length
}

export async function listOpenConflicts(ctx: Ctx, keyId: string) {
  await getKeyInTenant(ctx, keyId)
  return ctx.db
    .select()
    .from(sourceConflict)
    .where(
      and(
        eq(sourceConflict.tenantId, ctx.tenantId),
        eq(sourceConflict.keyId, keyId),
        isNull(sourceConflict.resolvedAt),
      ),
    )
    .orderBy(desc(sourceConflict.createdAt))
}

/** "Keep the repo version": the current source text already is the repo's, so just close the conflict. */
export async function keepRepoVersion(ctx: Ctx, keyId: string) {
  await getKeyInTenant(ctx, keyId)
  await resolveConflicts(ctx.db, ctx, [keyId], 'repo')
}
