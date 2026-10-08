import { po, type GetTextTranslation, type GetTextTranslations } from 'gettext-parser'
import { buildPluralIcu, parsePluralIcu, pluralBranchFor } from './icu.ts'
import { defaultPluralForms, pluralIndexCategories } from './plural-forms.ts'
import type { Entry, ParseContext, ParseResult, SerializeContext } from './types.ts'

const entryId = (context: string, key: string) => `${context}\u0004${key}`

function pluralFormsOf(data: GetTextTranslations, locale: string) {
  return data.headers['Plural-Forms'] || defaultPluralForms(locale)
}

function messages(data: GetTextTranslations) {
  return Object.values(data.translations).flatMap((byId) => Object.values(byId).filter((t) => t.msgid !== ''))
}

export function parsePo(content: string, ctx: ParseContext<'po'>): ParseResult<'po'> {
  const data = po.parse(content)
  const categories = pluralIndexCategories(ctx.locale, pluralFormsOf(data, ctx.locale))
  const entries: Entry[] = []

  for (const t of messages(data)) {
    const base: Omit<Entry, 'value' | 'isPlural'> = { key: t.msgid, context: t.msgctxt ?? '' }
    if (t.comments?.extracted) base.description = t.comments.extracted
    if (t.comments?.flag?.split(',').some((f) => f.trim() === 'fuzzy')) base.needsReview = true

    if (t.msgid_plural !== undefined) {
      const branches: Record<string, string> = {}
      if (t.msgstr.some(Boolean)) {
        t.msgstr.forEach((text, index) => {
          const category = categories[index]
          if (category && text) branches[category] ??= text
        })
        branches.other ??= t.msgstr.findLast(Boolean)!
      } else if (ctx.isSource) {
        branches.one = t.msgid
        branches.other = t.msgid_plural
      } else continue
      entries.push({ ...base, value: buildPluralIcu(branches), isPlural: true })
      continue
    }

    const value = t.msgstr[0] || (ctx.isSource ? t.msgid : '')
    if (!value) continue
    entries.push({ ...base, value, isPlural: false })
  }

  return { entries, options: {} }
}

const msgidFallback = (t: GetTextTranslation) =>
  t.msgid_plural === undefined ? t.msgid : buildPluralIcu({ one: t.msgid, other: t.msgid_plural })

export function serializePo(entries: Entry[], ctx: SerializeContext<'po'>): string {
  if (ctx.template && ctx.keepUnknown) return patchPoFile(ctx.template, entries, ctx)
  const data: GetTextTranslations = ctx.template
    ? po.parse(ctx.template)
    : { charset: 'utf-8', headers: {}, translations: { '': { '': { msgid: '', msgstr: [''] } } } }
  data.headers = {
    ...data.headers,
    Language: ctx.locale,
    'Content-Type': 'text/plain; charset=UTF-8',
    'Plural-Forms': data.headers['Plural-Forms'] || defaultPluralForms(ctx.locale),
  }
  const categories = pluralIndexCategories(ctx.locale, data.headers['Plural-Forms']!)
  const byId = new Map(entries.map((e) => [entryId(e.context ?? '', e.key), e]))
  const seen = new Set<string>()

  const fill = (t: GetTextTranslation, entry: Entry | undefined) => {
    // a source entry that only repeats its msgid keeps the empty msgstr gettext expects
    if (ctx.isSource && entry && !t.msgstr.some(Boolean) && entry.value === msgidFallback(t)) return
    const message = entry?.isPlural ? parsePluralIcu(entry.value) : null
    if (t.msgid_plural !== undefined) {
      t.msgstr = categories.map((c) => (message ? pluralBranchFor(message, c) : ''))
    } else {
      t.msgstr = [entry && !message ? entry.value : '']
    }
    if (entry && t.comments?.flag) {
      const flags = t.comments.flag
        .split(',')
        .map((f) => f.trim())
        .filter((f) => f && f !== 'fuzzy')
      t.comments.flag = flags.join(', ')
    }
  }

  for (const t of messages(data)) {
    const id = entryId(t.msgctxt ?? '', t.msgid)
    seen.add(id)
    fill(t, byId.get(id))
  }

  for (const entry of entries) {
    const context = entry.context ?? ''
    const id = entryId(context, entry.key)
    if (seen.has(id)) continue
    const t: GetTextTranslation = { msgid: entry.key, msgstr: [] }
    if (context) t.msgctxt = context
    if (entry.description) t.comments = { extracted: entry.description } as GetTextTranslation['comments']
    if (entry.isPlural) {
      const source = parsePluralIcu(entry.source ?? entry.value)
      t.msgid_plural = source ? pluralBranchFor(source, 'other') : entry.key
    }
    fill(t, entry)
    data.translations[context] ??= {}
    data.translations[context][entry.key] = t
  }

  const folded = ctx.template ? /^msg\w*(\[\d+\])? ""\r?\n"/m.test(ctx.template) : false
  return po.compile(data, { foldLength: folded ? 76 : 0 }).toString('utf8') + '\n'
}

const unquote = (line: string) =>
  JSON.parse(line.slice(line.indexOf('"')).replace(/\\([^"\\nrt])/g, '\\\\$1')) as string
const quote = (text: string) =>
  `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\t/g, '\\t')}"`

/**
 * Replaces the msgstr of the given entries in place and leaves every other byte alone. gettext-parser
 * reorders comments and rewrites headers when compiling, which would bury edits in noise.
 */
export function patchPo(content: string, entries: Entry[], ctx: ParseContext<'po'>): string {
  if (!entries.length) return content
  const categories = pluralIndexCategories(ctx.locale, pluralFormsOf(po.parse(content), ctx.locale))
  const byId = new Map(entries.map((e) => [entryId(e.context ?? '', e.key), e]))
  const lines = content.split('\n')
  const out: string[] = []

  // reads a keyword's string, including continuation lines; returns the text and the next index
  const read = (start: number) => {
    let text = unquote(lines[start]!)
    let i = start + 1
    while (i < lines.length && lines[i]!.startsWith('"')) text += unquote(lines[i++]!)
    return { text, next: i }
  }

  let msgctxt = ''
  let msgid: string | null = null
  for (let i = 0; i < lines.length;) {
    const line = lines[i]!
    if (line.startsWith('msgctxt ')) {
      const { text, next } = read(i)
      msgctxt = text
      out.push(...lines.slice(i, next))
      i = next
    } else if (line.startsWith('msgid ')) {
      const { text, next } = read(i)
      msgid = text
      out.push(...lines.slice(i, next))
      i = next
    } else if (line.startsWith('msgstr') && msgid) {
      let end = i
      while (end < lines.length && (lines[end]!.startsWith('msgstr') || lines[end]!.startsWith('"'))) end++
      const entry = byId.get(entryId(msgctxt, msgid))
      if (!entry) out.push(...lines.slice(i, end))
      else {
        if (!entry.needsReview) clearFuzzy(out)
        if (line.startsWith('msgstr[')) {
          const message = parsePluralIcu(entry.value)
          categories.forEach((c, index) =>
            out.push(`msgstr[${index}] ${quote(message ? pluralBranchFor(message, c) : entry.value)}`),
          )
        } else out.push(`msgstr ${quote(entry.value)}`)
      }
      msgctxt = ''
      msgid = null
      i = end
    } else {
      if (!line.trim()) msgctxt = ''
      out.push(line)
      i++
    }
  }
  return out.join('\n')
}

// drops `fuzzy` from the flag line of the message being written, `out` ends with that message's comments
function clearFuzzy(out: string[]) {
  for (let i = out.length - 1; i >= 0 && out[i]!.trim(); i--) {
    if (!out[i]!.startsWith('#,')) continue
    const flags = out[i]!.slice(2)
      .split(',')
      .map((f) => f.trim())
      .filter((f) => f && f !== 'fuzzy')
    if (flags.length) out[i] = `#, ${flags.join(', ')}`
    else out.splice(i, 1)
    return
  }
}

/**
 * Exports into a locale's own .po file: changed translations are patched in place, messages the file
 * doesn't have yet are appended, and messages wortwerk doesn't know are left alone.
 */
function patchPoFile(template: string, entries: Entry[], ctx: SerializeContext<'po'>): string {
  const data = po.parse(template)
  const known = new Set(messages(data).map((t) => entryId(t.msgctxt ?? '', t.msgid)))
  const current = new Map(
    parsePo(template, { locale: ctx.locale }).entries.map((e) => [entryId(e.context ?? '', e.key), e]),
  )
  const changed = entries.filter((e) => {
    const id = entryId(e.context ?? '', e.key)
    return known.has(id) && current.get(id)?.value !== e.value
  })
  let out = patchPo(template, changed, ctx)

  const added = entries.filter((e) => !known.has(entryId(e.context ?? '', e.key)))
  if (!added.length) return out
  const categories = pluralIndexCategories(ctx.locale, pluralFormsOf(data, ctx.locale))
  const blocks = added.map((entry) => {
    const lines: string[] = []
    if (entry.description) lines.push(...entry.description.split('\n').map((l) => `#. ${l}`))
    if (entry.context) lines.push(`msgctxt ${quote(entry.context)}`)
    lines.push(`msgid ${quote(entry.key)}`)
    if (entry.isPlural) {
      const source = parsePluralIcu(entry.source ?? entry.value)
      lines.push(`msgid_plural ${quote(source ? pluralBranchFor(source, 'other') : entry.key)}`)
      const message = parsePluralIcu(entry.value)
      categories.forEach((c, index) =>
        lines.push(`msgstr[${index}] ${quote(message ? pluralBranchFor(message, c) : '')}`),
      )
    } else lines.push(`msgstr ${quote(entry.value)}`)
    return lines.join('\n')
  })
  out = out.replace(/\n*$/, '\n')
  return out + '\n' + blocks.join('\n\n') + '\n'
}
