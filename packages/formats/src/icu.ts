import { parse, TYPE, type MessageFormatElement } from '@formatjs/icu-messageformat-parser'
import type { Interpolation } from './types.ts'

export const pluralCategories = ['zero', 'one', 'two', 'few', 'many', 'other'] as const
export type PluralCategory = (typeof pluralCategories)[number]

export function localePluralCategories(locale: string): PluralCategory[] {
  const categories = new Intl.PluralRules(locale).resolvedOptions().pluralCategories
  return pluralCategories.filter((c) => categories.includes(c))
}

export function escapeIcuLiteral(text: string, inPlural = false) {
  const specials = inPlural ? '{}#' : '{}'
  let out = ''
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!
    const next = text[i + 1]
    if (specials.includes(c)) out += `'${c}'`
    else if (c === "'" && next !== undefined && (specials.includes(next) || next === "'")) out += "''"
    else out += c
  }
  return out
}

const placeholderPatterns: Record<Exclude<Interpolation, 'icu'>, RegExp> = {
  i18next: /\{\{\s*([\w.-]+)\s*\}\}/g,
  rails: /%\{([\w.-]+)\}/g,
}

const placeholderFormats: Record<Exclude<Interpolation, 'icu'>, (name: string) => string> = {
  i18next: (name) => `{{${name}}}`,
  rails: (name) => `%{${name}}`,
}

export function textToIcu(text: string, style: Interpolation, inPlural = false) {
  if (style === 'icu') return text
  let out = ''
  let last = 0
  for (const match of text.matchAll(placeholderPatterns[style])) {
    out += escapeIcuLiteral(text.slice(last, match.index), inPlural)
    out += inPlural && match[1] === 'count' ? '#' : `{${match[1]}}`
    last = match.index + match[0].length
  }
  return out + escapeIcuLiteral(text.slice(last), inPlural)
}

export function icuToText(icu: string, style: Interpolation, inPlural = false) {
  if (style === 'icu') return icu
  let ast: MessageFormatElement[]
  try {
    if (inPlural) {
      const [plural] = parse(`{count, plural, other {${icu}}}`, { ignoreTag: true })
      ast = plural?.type === TYPE.plural ? plural.options.other!.value : []
    } else {
      ast = parse(icu, { ignoreTag: true })
    }
  } catch {
    return icu
  }
  const format = placeholderFormats[style]
  let out = ''
  for (const el of ast) {
    if (el.type === TYPE.literal) out += el.value
    else if (el.type === TYPE.argument) out += format(el.value)
    else if (el.type === TYPE.pound) out += format('count')
    else return icu
  }
  return out
}

export type PluralMessage = {
  variable: string
  branches: Record<string, string>
}

export function parsePluralIcu(icu: string): PluralMessage | null {
  let ast: MessageFormatElement[]
  try {
    ast = parse(icu.trim(), { ignoreTag: true, captureLocation: true })
  } catch {
    return null
  }
  const [el] = ast
  if (ast.length !== 1 || el?.type !== TYPE.plural) return null
  const source = icu.trim()
  const branches: Record<string, string> = {}
  for (const [name, option] of Object.entries(el.options)) {
    const { start, end } = option.location!
    branches[name] = source.slice(start.offset + 1, end.offset - 1)
  }
  return { variable: el.value, branches }
}

export function buildPluralIcu(branches: Record<string, string>, variable = 'count') {
  const order = (name: string) => {
    if (name.startsWith('=')) return -1
    return pluralCategories.indexOf(name as PluralCategory)
  }
  const names = Object.keys(branches).sort((a, b) => order(a) - order(b))
  return `{${variable}, plural, ${names.map((n) => `${n} {${branches[n]}}`).join(' ')}}`
}

export function pluralBranchFor(message: PluralMessage, category: string) {
  return message.branches[category] ?? message.branches.other ?? ''
}

export type IcuIssue = { message: string }

export function validateIcu(icu: string): IcuIssue | null {
  try {
    parse(icu, { ignoreTag: true })
    return null
  } catch (error) {
    return { message: error instanceof Error ? error.message : String(error) }
  }
}

export function icuArguments(icu: string): string[] {
  const names = new Set<string>()
  const walk = (elements: MessageFormatElement[]) => {
    for (const el of elements) {
      if (el.type === TYPE.literal || el.type === TYPE.pound) continue
      if (el.type === TYPE.tag) {
        walk(el.children)
        continue
      }
      names.add(el.value)
      if (el.type === TYPE.plural || el.type === TYPE.select) {
        for (const option of Object.values(el.options)) walk(option.value)
      }
    }
  }
  try {
    walk(parse(icu, { ignoreTag: true }))
  } catch {
    return []
  }
  return [...names].sort()
}
