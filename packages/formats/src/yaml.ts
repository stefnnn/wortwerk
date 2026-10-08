import {
  Document,
  isMap,
  isPair,
  isScalar,
  isSeq,
  parseDocument,
  stringify,
  type Pair,
  type Scalar,
  type YAMLMap,
  type YAMLSeq,
} from 'yaml'
import { icuToText, parsePluralIcu, pluralBranchFor, pluralCategories } from './icu.ts'
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
import type { Entry, ParseContext, ParseResult, SerializeContext, YamlOptions } from './types.ts'

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
      else if (Array.isArray(value as unknown)) {
        // string lists become entries keyed by index (`list.0`, `list.1`)
        ;(value as unknown[]).forEach((item, i) => {
          if (typeof item === 'string') entries.push(toEntry(`${key}.${i}`, item, interpolation))
        })
      }
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
  // a template already in this locale's shape is patched in place, byte-for-byte where untouched
  if (ctx.template && (!rootLocaleKey || rootKey === ctx.locale)) {
    const patched = patchYaml(ctx.template, entries, {
      rootLocaleKey,
      interpolation,
      locale: ctx.locale,
      keepUnknown: ctx.keepUnknown,
    })
    if (patched !== null) return patched
  }
  const byKey = new Map(entries.map((e) => [e.key, e]))
  const used = new Set<string>()
  const keepUnknown = ctx.keepUnknown ?? false

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
      if (isSeq(pair.value)) {
        walkSeq(pair.value, key)
        return pair.value.items.length > 0
      }
      if (!entry) return keepUnknown
      used.add(key)
      if (entry.isPlural) {
        const forms = renderPlural(entry)
        if (forms) {
          pair.value = doc.createNode(forms)
          return true
        }
      }
      setText(pair, entry)
      return true
    })
  }

  // only touch a scalar whose text changed, so block styles and folding survive
  const setText = (holder: { value?: unknown }, entry: Entry) => {
    const text = icuToText(entry.value, interpolation)
    if (isScalar(holder.value)) {
      if (holder.value.value !== text) holder.value.value = text
    } else holder.value = doc.createNode(text)
  }

  const walkSeq = (seq: YAMLSeq, key: string) => {
    seq.items = seq.items.filter((item, i) => {
      if (!isScalar(item) || typeof item.value !== 'string') return true
      const entry = byKey.get(`${key}.${i}`)
      if (!entry) return keepUnknown
      used.add(entry.key)
      const text = icuToText(entry.value, interpolation)
      if (item.value !== text) item.value = text
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
    else if (isTree(value) && isSeq(existing) && Object.keys(value).every((k) => /^\d+$/.test(k))) {
      for (const [index, text] of Object.entries(value)) existing.set(Number(index), doc.createNode(text))
    } else map.set(key, doc.createNode(value))
  }
}

/**
 * Brings `content` in line with `entries` by editing source ranges only: changed string scalars are
 * replaced, keys missing from `entries` are cut out (unless `keepUnknown`) and new keys are appended to
 * their parent map, every other byte (comments, folding, quoting, blank lines) stays. Plural maps keep
 * the categories they already have. Returns null when that isn't enough (removed list items, emptied
 * maps, new keys inside lists or flow maps), so the caller can fall back to a full re-serialize.
 */
export function patchYaml(content: string, entries: Entry[], options: YamlOptions): string | null {
  const doc = parseDocument(content)
  if (!isMap(doc.contents)) return null
  const interpolation = options.interpolation ?? 'icu'
  const keepUnknown = options.keepUnknown ?? false
  let root: YAMLMap = doc.contents
  if (options.rootLocaleKey) {
    const first = root.items[0]
    if (!first || !isMap(first.value)) return null
    root = first.value
  }
  const wanted = new Map(entries.map((e) => [e.key, e]))

  const edits: { start: number; end: number; text: string; seq: number }[] = []
  const seen = new Set<string>()
  let unsupported = false

  const replace = (node: Scalar, text: string) => {
    if (!node.range || typeof node.value !== 'string') return void (unsupported = true)
    if (text === node.value) return
    const rendered =
      text.includes('\n') || node.type === 'QUOTE_DOUBLE'
        ? JSON.stringify(text)
        : node.type === 'QUOTE_SINGLE'
          ? `'${text.replaceAll("'", "''")}'`
          : stringify(text, { lineWidth: 0 }).trimEnd()
    // a block scalar owns its trailing newline
    const block = node.type === 'BLOCK_FOLDED' || node.type === 'BLOCK_LITERAL'
    edits.push({
      start: node.range[0],
      end: node.range[1],
      text: rendered + (block ? '\n' : ''),
      seq: edits.length,
    })
  }

  const replacePlural = (map: YAMLMap, entry: Entry) => {
    const message = parsePluralIcu(entry.value)
    if (!message) return void (unsupported = true)
    for (const pair of map.items) {
      if (!isScalar(pair.value)) return void (unsupported = true)
      const text = icuToText(
        pluralBranchFor(message, String((pair.key as Scalar).value)),
        interpolation,
        true,
      )
      replace(pair.value, text)
    }
  }

  // cuts whole lines, from the start of the key line to the end of the value
  const remove = (pair: Pair) => {
    const keyStart = isScalar(pair.key) ? pair.key.range?.[0] : undefined
    const valueNode = pair.value
    const valueEnd = isScalar(valueNode) ? valueNode.range?.[1] : undefined
    if (keyStart === undefined || valueEnd === undefined) return void (unsupported = true)
    const start = content.lastIndexOf('\n', keyStart - 1) + 1
    const eol = content[valueEnd - 1] === '\n' ? valueEnd : content.indexOf('\n', valueEnd) + 1
    edits.push({ start, end: eol === 0 ? content.length : eol, text: '', seq: edits.length })
  }

  const walk = (map: YAMLMap, path: string[]) => {
    let kept = 0
    for (const pair of map.items) {
      if (!isScalar(pair.key)) {
        kept++
        continue
      }
      const segment = String(pair.key.value)
      const key = [...path, segment].join('.')
      const wantedEntry = wanted.get(key)
      if (wantedEntry?.isPlural && isMap(pair.value) && isPluralMap(pair.value.toJSON())) {
        kept++
        seen.add(key)
        replacePlural(pair.value, wantedEntry)
      } else if (isMap(pair.value)) {
        if (walk(pair.value, [...path, segment]) === 0 && pair.value.items.length > 0) unsupported = true
        kept++
      } else if (isSeq(pair.value)) {
        kept++
        pair.value.items.forEach((item, i) => {
          if (!isScalar(item)) return
          const entry = wanted.get(`${key}.${i}`)
          if (!entry) return void (unsupported = true)
          seen.add(entry.key)
          replace(item, icuToText(entry.value, interpolation))
        })
      } else if (isScalar(pair.value)) {
        const entry = wanted.get(key)
        if (!entry) {
          if (keepUnknown) kept++
          else remove(pair)
        } else {
          kept++
          seen.add(key)
          replace(pair.value, icuToText(entry.value, interpolation))
        }
      } else kept++
    }
    return kept
  }

  const endOf = (node: unknown): number | undefined => {
    if (isScalar(node)) return node.range?.[1]
    if (isMap(node) || isSeq(node)) {
      const last = node.items[node.items.length - 1]
      return endOf(isPair(last) ? last.value : last)
    }
    return undefined
  }

  // appends new keys after the last line of their parent map, indented like its other keys
  const addMissing = (map: YAMLMap, tree: Tree) => {
    const additions: Tree = {}
    for (const [key, value] of Object.entries(tree)) {
      const existing = map.get(key, true)
      if (existing === undefined) additions[key] = value
      else if (isTree(value) && isMap(existing) && !existing.flow) addMissing(existing, value)
      else unsupported = true
    }
    if (Object.keys(additions).length === 0) return
    const first = map.items[0]
    const end = endOf(map)
    const keyStart = first && isScalar(first.key) ? first.key.range?.[0] : undefined
    if (map.flow || end === undefined || keyStart === undefined) return void (unsupported = true)
    const indent = ' '.repeat(keyStart - (content.lastIndexOf('\n', keyStart - 1) + 1))
    const text = stringify(additions, { lineWidth: 0 })
      .trimEnd()
      .split('\n')
      .map((line) => indent + line)
      .join('\n')
    const eol = content[end - 1] === '\n' ? end - 1 : content.indexOf('\n', end)
    const at = eol === -1 ? content.length : eol + 1
    const lead = eol === -1 ? '\n' : ''
    edits.push({ start: at, end: at, text: lead + text + '\n', seq: edits.length })
  }

  walk(root, [])

  const missing: Tree = {}
  for (const entry of entries) {
    if (seen.has(entry.key)) continue
    if (entry.isPlural && !options.locale) return null
    const forms = entry.isPlural ? expandPlural(entry, options.locale!, interpolation) : null
    setPath(missing, entry.key.split('.'), forms ?? icuToText(entry.value, interpolation))
  }
  addMissing(root, missing)
  if (unsupported) return null

  let out = content
  for (const edit of edits.sort((a, b) => b.start - a.start || b.seq - a.seq))
    out = out.slice(0, edit.start) + edit.text + out.slice(edit.end)
  return out
}
