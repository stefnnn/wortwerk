import { Document, isMap, isScalar, parseDocument, stringify, type Pair, type YAMLMap } from 'yaml'
import { icuToText, pluralCategories } from './icu.ts'
import {
  collectLeaves,
  detectInterpolation,
  expandPlural,
  isTree,
  pluralEntry,
  setPath,
  toEntry,
  type Tree,
} from './tree.ts'
import type { Entry, ParseContext, ParseResult, SerializeContext } from './types.ts'

const localePattern = /^[a-z]{2,3}([-_][A-Za-z0-9]{2,8})*$/

function isPluralMap(value: unknown): value is Record<string, string> {
  if (!isTree(value)) return false
  const keys = Object.keys(value)
  return (
    keys.includes('other') &&
    keys.every((k) => (pluralCategories as readonly string[]).includes(k) && typeof value[k] === 'string')
  )
}

function rootKeyOf(data: Tree) {
  const keys = Object.keys(data)
  return keys.length === 1 && localePattern.test(keys[0]!) && isTree(data[keys[0]!]) ? keys[0]! : null
}

export function parseYaml(content: string, ctx: ParseContext<'yaml'>): ParseResult<'yaml'> {
  const data: unknown = parseDocument(content).toJS() ?? {}
  if (!isTree(data)) throw new Error('YAML translation file must contain a mapping')
  const rootKey = rootKeyOf(data)
  const rootLocaleKey = ctx.options?.rootLocaleKey ?? rootKey !== null
  const tree = rootLocaleKey && rootKey ? (data[rootKey] as Tree) : data
  const interpolation =
    ctx.options?.interpolation ?? detectInterpolation(collectLeaves(tree).map((l) => l.text))

  const entries: Entry[] = []
  const walk = (node: Tree, path: string[]) => {
    for (const [segment, value] of Object.entries(node)) {
      const key = [...path, segment].join('.')
      if (isPluralMap(value)) entries.push(pluralEntry(key, value, interpolation))
      else if (isTree(value)) walk(value, [...path, segment])
      else if (typeof value === 'string') entries.push(toEntry(key, value, interpolation))
    }
  }
  walk(tree, [])
  return { entries, options: { rootLocaleKey, interpolation } }
}

export function serializeYaml(entries: Entry[], ctx: SerializeContext<'yaml'>): string {
  const doc = ctx.template ? parseDocument(ctx.template) : new Document({})
  const templateData = doc.toJS() ?? {}
  const rootKey = isTree(templateData) ? rootKeyOf(templateData) : null
  const rootLocaleKey = ctx.options?.rootLocaleKey ?? rootKey !== null
  const interpolation =
    ctx.options?.interpolation ??
    (isTree(templateData) ? detectInterpolation(collectLeaves(templateData).map((l) => l.text)) : 'icu')
  const byKey = new Map(entries.map((e) => [e.key, e]))
  const used = new Set<string>()

  if (!isMap(doc.contents)) doc.contents = doc.createNode({}) as YAMLMap
  let root = doc.contents as YAMLMap
  if (rootLocaleKey) {
    const first = root.items[0] as Pair | undefined
    if (rootKey && first && isScalar(first.key) && isMap(first.value)) {
      first.key.value = ctx.locale
      root = first.value
    } else {
      const fresh = doc.createNode({}) as YAMLMap
      doc.contents = doc.createNode({ [ctx.locale]: {} }) as YAMLMap
      ;(doc.contents.items[0] as Pair).value = fresh
      root = fresh
    }
  }

  const renderPlural = (entry: Entry) => expandPlural(entry, ctx.locale, interpolation)

  const walk = (map: YAMLMap, path: string[]) => {
    map.items = map.items.filter((pair) => {
      if (!isScalar(pair.key)) return true
      const segment = String(pair.key.value)
      const key = [...path, segment].join('.')
      const entry = byKey.get(key)
      if (isMap(pair.value) && !(entry?.isPlural && isPluralMap(pair.value.toJSON()))) {
        walk(pair.value, [...path, segment])
        return pair.value.items.length > 0
      }
      if (!entry) return false
      used.add(key)
      if (entry.isPlural) {
        const forms = renderPlural(entry)
        if (forms) {
          pair.value = doc.createNode(forms)
          return true
        }
      }
      const text = icuToText(entry.value, interpolation)
      if (isScalar(pair.value)) pair.value.value = text
      else pair.value = doc.createNode(text)
      return true
    })
  }
  walk(root, [])

  const missing: Tree = {}
  for (const entry of entries) {
    if (used.has(entry.key)) continue
    const forms = entry.isPlural ? renderPlural(entry) : null
    setPath(missing, entry.key.split('.'), forms ?? icuToText(entry.value, interpolation))
  }
  mergeInto(doc, root, missing)

  if (!ctx.template) return stringify(doc.toJS(), { lineWidth: 0 })
  return doc.toString({ lineWidth: 0 })
}

function mergeInto(doc: Document, map: YAMLMap, tree: Tree) {
  for (const [key, value] of Object.entries(tree)) {
    const existing = map.get(key, true)
    if (isTree(value) && isMap(existing)) mergeInto(doc, existing, value)
    else map.set(key, doc.createNode(value))
  }
}
