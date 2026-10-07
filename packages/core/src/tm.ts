import { sql } from 'drizzle-orm'
import { schema } from '@wortwerk/db'
import type { Ctx } from './context.ts'
import { getKeyInTenant } from './translations.ts'

const { translation, translationKey, project } = schema

export type TmSuggestion = {
  value: string
  source: string
  score: number
  keyName: string
  projectName: string
}

export async function tmSuggestions(
  ctx: Ctx,
  keyId: string,
  locale: string,
  limit = 5,
): Promise<TmSuggestion[]> {
  const key = await getKeyInTenant(ctx, keyId)
  const source = await ctx.db.query.translation.findFirst({
    where: (t, { and, eq }) => and(eq(t.keyId, keyId), eq(t.locale, key.project.sourceLocale)),
    columns: { value: true },
  })
  if (!source?.value) return []

  // guests only get matches from the projects they can see
  const scope = ctx.guest
    ? sql`and p.id in (${sql.join(
        [...ctx.guest.keys()].map((id) => sql`${id}`),
        sql`, `,
      )})`
    : sql``
  if (ctx.guest && !ctx.guest.size) return []

  const result = await ctx.db.execute<TmSuggestion>(sql`
    select distinct on (tgt.value)
      tgt.value as "value",
      src.value as "source",
      similarity(src.value, ${source.value})::float as "score",
      k.name as "keyName",
      p.name as "projectName"
    from ${translation} src
    join ${translationKey} k on k.id = src.key_id
    join ${project} p on p.id = k.project_id and p.source_locale = src.locale
    join ${translation} tgt on tgt.key_id = k.id and tgt.locale = ${locale}
      and tgt.status in ('translated', 'approved') and tgt.value <> ''
    where src.tenant_id = ${ctx.tenantId}
      and src.key_id <> ${keyId}
      and src.value % ${source.value}
      ${scope}
    order by tgt.value, similarity(src.value, ${source.value}) desc
  `)
  return result.rows.sort((a, b) => b.score - a.score).slice(0, limit)
}
