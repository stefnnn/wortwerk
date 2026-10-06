import { and, asc, eq, inArray, isNull, ne, sql } from 'drizzle-orm'
import { schema } from '@wortwerk/db'
import { parseFile, serializeFile, type Entry, type FileFormat } from '@wortwerk/formats'
import { chunks, type Ctx } from './context.ts'
import { assertKeyCapacity } from './limits.ts'
import { addLocale, filePathFor, getFile, getProject } from './projects.ts'
import { flagDependentsForReview, type TranslationStatus } from './translations.ts'

const { translationKey, translation, translationRevision, projectFile, projectFileSnapshot } = schema

const identity = (context: string | undefined, name: string) => `${context ?? ''}\u0004${name}`

export type ImportResult = {
  keysAdded: number
  keysRestored: number
  keysObsoleted: number
  translationsChanged: number
  translationsUnchanged: number
  skipped: number
}

export async function importFileContent(
  ctx: Ctx,
  input: {
    projectId: string
    fileId: string
    locale: string
    content: string
    overwrite?: boolean
    source?: 'import' | 'git'
    status?: TranslationStatus
    keyIds?: ReadonlySet<string>
  },
): Promise<ImportResult> {
  const project = await getProject(ctx, { id: input.projectId })
  const file = await getFile(ctx, input.fileId)
  const isSource = input.locale === project.sourceLocale
  const parsed = parseFile(file.format as FileFormat, input.content, {
    locale: input.locale,
    isSource,
    options: file.options as never,
  })

  return ctx.db.transaction(async (tx) => {
    const tctx = { ...ctx, db: tx }
    await addLocale(tctx, project.id, input.locale)
    if (!Object.keys(file.options).length && isSource) {
      await tx.update(projectFile).set({ options: parsed.options }).where(eq(projectFile.id, file.id))
    }
    await tx
      .insert(projectFileSnapshot)
      .values({ tenantId: ctx.tenantId, fileId: file.id, locale: input.locale, content: input.content })
      .onConflictDoUpdate({
        target: [projectFileSnapshot.fileId, projectFileSnapshot.locale],
        set: { content: input.content, updatedAt: new Date() },
      })

    const result: ImportResult = {
      keysAdded: 0,
      keysRestored: 0,
      keysObsoleted: 0,
      translationsChanged: 0,
      translationsUnchanged: 0,
      skipped: 0,
    }

    const keys = await tx
      .select()
      .from(translationKey)
      .where(and(eq(translationKey.tenantId, ctx.tenantId), eq(translationKey.fileId, file.id)))
    const keyById = new Map(keys.map((k) => [identity(k.context, k.name), k]))

    if (isSource) {
      const fresh = parsed.entries.filter((e) => !keyById.has(identity(e.context, e.key)))
      const restored = keys.filter(
        (k) =>
          k.obsoleteAt &&
          parsed.entries.some((e) => identity(e.context, e.key) === identity(k.context, k.name)),
      )
      await assertKeyCapacity(tctx, fresh.length + restored.length)

      for (const batch of chunks(fresh)) {
        const inserted = await tx
          .insert(translationKey)
          .values(
            batch.map((e) => ({
              tenantId: ctx.tenantId,
              projectId: project.id,
              fileId: file.id,
              name: e.key,
              context: e.context ?? '',
              description: e.description ?? '',
              isPlural: e.isPlural,
            })),
          )
          .returning()
        for (const k of inserted) keyById.set(identity(k.context, k.name), k)
      }
      result.keysAdded = fresh.length
      result.keysRestored = restored.length

      const present = new Set(parsed.entries.map((e) => identity(e.context, e.key)))
      const gone = keys
        .filter((k) => !k.obsoleteAt && !present.has(identity(k.context, k.name)))
        .map((k) => k.id)
      for (const batch of chunks(gone)) {
        await tx
          .update(translationKey)
          .set({ obsoleteAt: new Date() })
          .where(inArray(translationKey.id, batch))
      }
      result.keysObsoleted = gone.length

      const rows = parsed.entries.map((e, position) => {
        const k = keyById.get(identity(e.context, e.key))!
        return { id: k.id, position, isPlural: e.isPlural, description: e.description ?? k.description }
      })
      for (const batch of chunks(rows, 500)) {
        const values = sql.join(
          batch.map((r) => sql`(${r.id}, ${r.position}::int, ${r.isPlural}::boolean, ${r.description})`),
          sql`, `,
        )
        await tx.execute(sql`
          update ${translationKey} set
            position = v.position, is_plural = v.is_plural, description = v.description,
            obsolete_at = null, updated_at = now()
          from (values ${values}) as v(id, position, is_plural, description)
          where ${translationKey.id} = v.id
        `)
      }
    }

    const writes: Array<{ keyId: string; value: string; status: TranslationStatus }> = []
    for (const entry of parsed.entries) {
      const k = keyById.get(identity(entry.context, entry.key))
      if (!k || (!isSource && k.obsoleteAt)) {
        result.skipped++
        continue
      }
      if (input.keyIds && !input.keyIds.has(k.id)) continue
      const status: TranslationStatus = isSource
        ? 'approved'
        : entry.needsReview
          ? 'needs_review'
          : (input.status ?? 'translated')
      writes.push({ keyId: k.id, value: entry.value, status })
    }

    const changedSourceKeys: string[] = []
    for (const batch of chunks(writes)) {
      const existing = await tx
        .select({ keyId: translation.keyId, value: translation.value, status: translation.status })
        .from(translation)
        .where(
          and(
            inArray(
              translation.keyId,
              batch.map((w) => w.keyId),
            ),
            eq(translation.locale, input.locale),
          ),
        )
      const current = new Map(existing.map((t) => [t.keyId, t]))
      const changed = batch.filter((w) => {
        const t = current.get(w.keyId)
        if (!t || t.status === 'untranslated' || !t.value) return true
        if (t.value === w.value) return false
        return isSource || input.overwrite
      })
      result.translationsUnchanged += batch.length - changed.length
      result.translationsChanged += changed.length
      if (!changed.length) continue
      if (isSource) changedSourceKeys.push(...changed.filter((w) => current.has(w.keyId)).map((w) => w.keyId))

      const upserted = await tx
        .insert(translation)
        .values(
          changed.map((w) => ({
            tenantId: ctx.tenantId,
            keyId: w.keyId,
            locale: input.locale,
            value: w.value,
            status: w.status,
            updatedById: ctx.userId,
          })),
        )
        .onConflictDoUpdate({
          target: [translation.keyId, translation.locale],
          set: {
            value: sql`excluded.value`,
            status: sql`excluded.status`,
            updatedById: sql`excluded.updated_by_id`,
            updatedAt: new Date(),
          },
        })
        .returning({ id: translation.id, value: translation.value, status: translation.status })
      await tx.insert(translationRevision).values(
        upserted.map((t) => ({
          tenantId: ctx.tenantId,
          translationId: t.id,
          value: t.value,
          status: t.status,
          source: input.source ?? 'import',
          userId: ctx.userId,
        })),
      )
    }

    for (const batch of chunks(changedSourceKeys)) {
      await flagDependentsForReview(tx, ctx.tenantId, batch, project.sourceLocale)
    }
    return result
  })
}

export async function exportFileContent(ctx: Ctx, input: { fileId: string; locale: string }) {
  const file = await getFile(ctx, input.fileId)
  const project = await getProject(ctx, { id: file.projectId })
  const isSource = input.locale === project.sourceLocale

  const rows = await ctx.db
    .select({
      name: translationKey.name,
      context: translationKey.context,
      description: translationKey.description,
      isPlural: translationKey.isPlural,
      value: translation.value,
      locale: translation.locale,
    })
    .from(translationKey)
    .innerJoin(
      translation,
      and(
        eq(translation.keyId, translationKey.id),
        inArray(translation.locale, [...new Set([input.locale, project.sourceLocale])]),
        ne(translation.status, 'untranslated'),
        ne(translation.value, ''),
      ),
    )
    .where(
      and(
        eq(translationKey.tenantId, ctx.tenantId),
        eq(translationKey.fileId, file.id),
        isNull(translationKey.obsoleteAt),
      ),
    )
    .orderBy(asc(translationKey.position))

  const sources = new Map(
    rows.filter((r) => r.locale === project.sourceLocale).map((r) => [identity(r.context, r.name), r.value]),
  )
  const entries: Entry[] = rows
    .filter((r) => r.locale === input.locale)
    .map((r) => ({
      key: r.name,
      context: r.context,
      value: r.value,
      isPlural: r.isPlural,
      description: r.description || undefined,
      source: sources.get(identity(r.context, r.name)),
    }))

  const snapshots = await ctx.db
    .select()
    .from(projectFileSnapshot)
    .where(
      and(
        eq(projectFileSnapshot.fileId, file.id),
        inArray(projectFileSnapshot.locale, [input.locale, project.sourceLocale]),
      ),
    )
  const template =
    snapshots.find((s) => s.locale === project.sourceLocale)?.content ??
    snapshots.find((s) => s.locale === input.locale)?.content

  const content = serializeFile(file.format as FileFormat, entries, {
    locale: input.locale,
    isSource,
    template,
    options: file.options as never,
  })
  return { path: filePathFor(file.path, input.locale), content, count: entries.length }
}
