import { icuToText, pluralCategories } from './icu.ts'
import {
  collectLeaves,
  detectIndent,
  detectInterpolation,
  expandPlural,
  isTree,
  pluralEntry,
  setPath,
  toEntry,
  type Tree,
} from './tree.ts'
import type { Entry, JsonOptions, ParseContext, ParseResult, SerializeContext } from './types.ts'

const pluralSuffix = new RegExp(`^(.*)_(${pluralCategories.join('|')})$`)

function parseTree(content: string): Tree {
  const data: unknown = JSON.parse(content)
  if (!isTree(data)) throw new Error('JSON translation file must contain an object')
  return data
}

function resolveOptions(tree: Tree, given: JsonOptions = {}): Required<JsonOptions> {
  const leaves = collectLeaves(tree)
  const style = given.style ?? (Object.values(tree).some(isTree) ? 'nested' : 'flat')
  const plurals = given.plurals ?? (leaves.some((l) => l.path.at(-1)!.endsWith('_other')) ? 'i18next' : 'icu')
  const interpolation =
    given.interpolation ??
    (plurals === 'i18next' ? 'i18next' : detectInterpolation(leaves.map((l) => l.text)))
  return { style, plurals, interpolation }
}

export function parseJson(content: string, ctx: ParseContext<'json'>): ParseResult<'json'> {
  const tree = parseTree(content)
  const options = resolveOptions(tree, ctx.options)
  const leaves = collectLeaves(tree)
  const entries: Entry[] = []
  const plurals = new Map<string, { index: number; branches: Record<string, string> }>()

  if (options.plurals === 'i18next') {
    const bases = new Set(
      leaves.flatMap((l) => {
        const match = pluralSuffix.exec(l.path.at(-1)!)
        return match?.[2] === 'other' ? [[...l.path.slice(0, -1), match[1]!].join('.')] : []
      }),
    )
    for (const leaf of leaves) {
      const match = pluralSuffix.exec(leaf.path.at(-1)!)
      const base = match && [...leaf.path.slice(0, -1), match[1]!].join('.')
      if (base && bases.has(base)) {
        let group = plurals.get(base)
        if (!group) {
          group = { index: entries.length, branches: {} }
          plurals.set(base, group)
          entries.push({ key: base, value: '', isPlural: true })
        }
        group.branches[match[2]!] = leaf.text
        continue
      }
      entries.push(toEntry(leaf.path.join('.'), leaf.text, options.interpolation))
    }
    for (const [key, group] of plurals)
      entries[group.index] = pluralEntry(key, group.branches, options.interpolation)
  } else {
    for (const leaf of leaves) entries.push(toEntry(leaf.path.join('.'), leaf.text, options.interpolation))
  }

  return { entries, options }
}

export function serializeJson(entries: Entry[], ctx: SerializeContext<'json'>): string {
  const template = ctx.template ? parseTree(ctx.template) : undefined
  const options = resolveOptions(template ?? {}, ctx.options)
  const byKey = new Map(entries.map((e) => [e.key, e]))
  const used = new Set<string>()

  const render = (entry: Entry): Array<[string, string]> => {
    if (entry.isPlural && options.plurals === 'i18next') {
      const forms = expandPlural(entry, ctx.locale, options.interpolation)
      if (forms) return Object.entries(forms).map(([category, text]) => [`_${category}`, text])
    }
    return [['', icuToText(entry.value, options.interpolation)]]
  }

  const walk = (node: Tree, path: string[]): Tree => {
    const out: Tree = {}
    for (const [segment, value] of Object.entries(node)) {
      if (isTree(value)) {
        const child = walk(value, [...path, segment])
        if (Object.keys(child).length) out[segment] = child
        continue
      }
      const match = options.plurals === 'i18next' ? pluralSuffix.exec(segment) : null
      const pluralKey = match && [...path, match[1]!].join('.')
      const key = pluralKey && byKey.get(pluralKey)?.isPlural ? pluralKey : [...path, segment].join('.')
      const base = key === pluralKey ? match![1]! : segment
      const entry = byKey.get(key)
      if (!entry || used.has(key)) continue
      used.add(key)
      for (const [suffix, text] of render(entry)) out[base + suffix] = text
    }
    return out
  }

  const result = template ? walk(template, []) : {}
  for (const entry of entries) {
    if (used.has(entry.key)) continue
    const path = options.style === 'flat' ? [entry.key] : entry.key.split('.')
    for (const [suffix, text] of render(entry)) {
      setPath(result, [...path.slice(0, -1), path.at(-1)! + suffix], text)
    }
  }

  const trailing = ctx.template === undefined || ctx.template.endsWith('\n') ? '\n' : ''
  return JSON.stringify(result, null, detectIndent(ctx.template)) + trailing
}
