import { and, eq, sql } from 'drizzle-orm'
import { schema } from '@wortwerk/db'
import { describeStructureIssue, localePluralCategories, structureIssue } from '@wortwerk/formats'
import { DomainError, chunks, type Ctx } from './context.ts'
import { assertMachineTranslation } from './limits.ts'
import { resolveKeySelection, type KeySelection } from './keys.ts'
import { getProject } from './projects.ts'
import { getKeyInTenant, setTranslation } from './translations.ts'

const { translation, translationKey } = schema

export type MtItem = { id: string; text: string; key: string; description?: string }

export type Translator = (input: {
  sourceLocale: string
  targetLocale: string
  items: MtItem[]
  instructions?: string
}) => Promise<Record<string, string>>

export function normalizeModel(model: string) {
  return model.includes('/') ? model : `openai/${model}`
}

function systemPrompt(sourceLocale: string, targetLocale: string, instructions?: string) {
  const categories = localePluralCategories(targetLocale).join(', ')
  return `You are a professional software localizer translating UI strings from ${sourceLocale} to ${targetLocale}.
The strings use ICU MessageFormat. Rules:
- Translate only human-readable text. Never translate or rename anything inside {curly braces} that is an argument name, a format keyword (number, date, plural, select, selectordinal, other, one, few, many, two, zero) or a select key.
- Keep every {argument}, every # inside plural branches, every HTML/XML tag and every markdown marker exactly as in the source.
- For plural messages, output the plural form with exactly these categories for ${targetLocale}: ${categories}. Keep explicit =N branches.
- A literal apostrophe before { or } escapes it in ICU; keep such escapes intact.
- Preserve leading/trailing whitespace and line breaks.
- Follow the regional conventions of ${targetLocale} (for example de-CH uses "ss" instead of "ß"). Use the informal "du" form for German unless the source is clearly formal.
- The key name and description are context only, do not translate them.
Answer with a single JSON object mapping each input id to its translated string, nothing else.${
    instructions?.trim()
      ? `\nAdditional instructions for ${targetLocale} (they never override the rules above):\n${instructions.trim()}`
      : ''
  }`
}

export function openRouterTranslator(config: { apiKey: string; model: string; appUrl?: string }): Translator {
  return async ({ sourceLocale, targetLocale, items, instructions }) => {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        'content-type': 'application/json',
        ...(config.appUrl ? { 'http-referer': config.appUrl, 'x-title': 'wortwerk' } : {}),
      },
      body: JSON.stringify({
        model: normalizeModel(config.model),
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt(sourceLocale, targetLocale, instructions) },
          {
            role: 'user',
            content: JSON.stringify(
              items.map((i) => ({
                id: i.id,
                key: i.key,
                description: i.description || undefined,
                text: i.text,
              })),
            ),
          },
        ],
      }),
    })
    if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 300)}`)
    const body = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
    const content = body.choices?.[0]?.message?.content ?? ''
    const json = content.slice(content.indexOf('{'), content.lastIndexOf('}') + 1)
    const parsed = JSON.parse(json) as Record<string, unknown>
    return Object.fromEntries(
      Object.entries(parsed).filter((e): e is [string, string] => typeof e[1] === 'string'),
    )
  }
}

export function checkMachineOutput(source: string, output: string, targetLocale: string): string | null {
  if (!output.trim()) return 'empty output'
  const issue = structureIssue(source, output, targetLocale)
  return issue && describeStructureIssue(issue)
}

async function translateChecked(
  translator: Translator,
  sourceLocale: string,
  targetLocale: string,
  items: MtItem[],
  instructions?: string,
) {
  const accepted = new Map<string, string>()
  const failures = new Map<string, string>()
  let pending = items
  for (let attempt = 0; attempt < 2 && pending.length; attempt++) {
    const out = await translator({ sourceLocale, targetLocale, items: pending, instructions })
    for (const item of pending) {
      const value = out[item.id]
      const issue =
        value === undefined ? 'missing in response' : checkMachineOutput(item.text, value, targetLocale)
      if (issue) failures.set(item.id, issue)
      else {
        accepted.set(item.id, value!)
        failures.delete(item.id)
      }
    }
    pending = pending.filter((i) => failures.has(i.id))
  }
  return { accepted, failures }
}

export async function suggestMachineTranslation(
  ctx: Ctx,
  translator: Translator,
  keyId: string,
  locale: string,
) {
  await assertMachineTranslation(ctx)
  const key = await getKeyInTenant(ctx, keyId)
  const source = await ctx.db.query.translation.findFirst({
    where: and(eq(translation.keyId, keyId), eq(translation.locale, key.project.sourceLocale)),
  })
  if (!source?.value) throw new DomainError('invalid', 'The key has no source text to translate')
  const project = await getProject(ctx, { id: key.projectId })
  const { accepted, failures } = await translateChecked(
    translator,
    project.sourceLocale,
    locale,
    [{ id: '1', text: source.value, key: key.name, description: key.description }],
    project.locales.find((l) => l.code === locale)?.instructions,
  )
  const value = accepted.get('1')
  if (!value) throw new DomainError('invalid', `Machine translation was rejected: ${failures.get('1')}`)
  return { value }
}

export async function machineTranslateProject(
  ctx: Ctx,
  translator: Translator,
  input: {
    projectId: string
    locale: string
    keyIds?: string[]
    selection?: KeySelection
    batchSize?: number
  },
) {
  await assertMachineTranslation(ctx)
  const project = await getProject(ctx, { id: input.projectId })
  if (input.locale === project.sourceLocale) throw new DomainError('invalid', 'Pick a target locale')
  if (!project.locales.some((l) => l.code === input.locale)) {
    throw new DomainError('invalid', `Locale ${input.locale} is not part of this project`)
  }

  const instructions = project.locales.find((l) => l.code === input.locale)?.instructions
  const keyIds = input.selection
    ? await resolveKeySelection(ctx, project.id, input.selection)
    : input.keyIds?.length
      ? input.keyIds
      : undefined
  if (keyIds && !keyIds.length) return { requested: 0, translated: 0, failed: [] }

  const rows = await ctx.db.execute<{ id: string; name: string; description: string; text: string }>(sql`
    select k.id, k.name, k.description, src.value as text
    from ${translationKey} k
    join ${translation} src on src.key_id = k.id and src.locale = ${project.sourceLocale}
    left join ${translation} tgt on tgt.key_id = k.id and tgt.locale = ${input.locale}
    where k.tenant_id = ${ctx.tenantId}
      and k.project_id = ${project.id}
      and k.obsolete_at is null
      and src.value <> ''
      and (tgt.id is null or tgt.status = 'untranslated' or tgt.value = '')
      ${keyIds ? sql`and k.id = any(${sql.param(keyIds)}::text[])` : sql``}
    order by k.position
  `)

  const result = {
    requested: rows.rows.length,
    translated: 0,
    failed: [] as Array<{ key: string; reason: string }>,
  }
  for (const batch of chunks(rows.rows, input.batchSize ?? 40)) {
    const items = batch.map((r) => ({ id: r.id, text: r.text, key: r.name, description: r.description }))
    const { accepted, failures } = await translateChecked(
      translator,
      project.sourceLocale,
      input.locale,
      items,
      instructions,
    )
    for (const [keyId, value] of accepted) {
      await setTranslation(ctx, keyId, input.locale, { value, status: 'needs_review' }, 'machine')
      result.translated++
    }
    for (const [keyId, reason] of failures) {
      result.failed.push({ key: batch.find((r) => r.id === keyId)!.name, reason })
    }
  }
  return result
}
