import { parseSync } from 'oxc-parser'
import { icuToText } from './icu.ts'
import { detectInterpolation, setPath, toEntry, type Tree } from './tree.ts'
import type { Entry, ParseContext, ParseResult, SerializeContext } from './types.ts'

// .ts / .js translation files are read statically, never executed: only a literal object tree of
// strings is understood, anything dynamic is rejected. Values are patched in place by source span.

type Node = { type: string; start: number; end: number }
type Literal = Node & { value: unknown; raw: string }
type TemplateLiteral = Node & { expressions: Node[]; quasis: Array<{ value: { cooked: string | null } }> }
type Binary = Node & { operator: string; left: Node; right: Node }
type Wrapper = Node & { expression: Node }
type Property = Node & {
  kind: string
  computed: boolean
  method: boolean
  shorthand: boolean
  key: Node
  value: Node
}
type ObjectNode = Node & { properties: Node[] }
type ArrayNode = Node & { elements: Array<Node | null> }
type Identifier = Node & { name: string }

type Slot = { path: string[]; node: Node; text: string }

const wrappers = new Set([
  'TSAsExpression',
  'TSSatisfiesExpression',
  'TSNonNullExpression',
  'TSTypeAssertion',
  'ParenthesizedExpression',
])

function unwrap(node: Node): Node {
  while (wrappers.has(node.type)) node = (node as Wrapper).expression
  return node
}

function lineOf(content: string, offset: number) {
  let line = 1
  for (let i = 0; i < offset; i++) if (content.charCodeAt(i) === 10) line++
  return line
}

class Reader {
  readonly content: string

  constructor(content: string) {
    this.content = content
  }

  fail(node: Node, message: string): never {
    throw new Error(
      `${message} (line ${lineOf(this.content, node.start)}), use a JSON or YAML file for dynamic content`,
    )
  }

  string(node: Node): string | null {
    node = unwrap(node)
    if (node.type === 'Literal') {
      const value = (node as Literal).value
      return typeof value === 'string' ? value : null
    }
    if (node.type === 'TemplateLiteral') {
      const t = node as TemplateLiteral
      return t.expressions.length === 0 ? (t.quasis[0]?.value.cooked ?? null) : null
    }
    if (node.type === 'BinaryExpression' && (node as Binary).operator === '+') {
      const left = this.string((node as Binary).left)
      const right = left === null ? null : this.string((node as Binary).right)
      return left === null || right === null ? null : left + right
    }
    return null
  }

  keyName(prop: Property): string {
    if (prop.type !== 'Property' || prop.kind !== 'init' || prop.method || prop.shorthand)
      this.fail(prop, 'Translation files may only contain plain `key: value` entries')
    const key = unwrap(prop.key)
    if (!prop.computed && key.type === 'Identifier') return (key as Identifier).name
    if (key.type === 'Literal') return String((key as Literal).value)
    const text = this.string(key)
    if (text === null) this.fail(prop, 'Computed keys are not supported')
    return text
  }

  collect(node: Node, path: string[] = [], out: Slot[] = []): Slot[] {
    node = unwrap(node)
    if (node.type === 'ObjectExpression') {
      for (const prop of (node as ObjectNode).properties)
        this.collect((prop as Property).value ?? prop, [...path, this.keyName(prop as Property)], out)
    } else if (node.type === 'ArrayExpression') {
      ;(node as ArrayNode).elements.forEach((el, i) => {
        if (el) this.collect(el, [...path, String(i)], out)
      })
    } else {
      const text = this.string(node)
      if (text !== null) out.push({ path, node, text })
      else if (node.type !== 'Literal') this.fail(node, `\`${path.join('.')}\` is not a static string`)
    }
    return out
  }
}

type Candidates = Map<string, Node>

function findRoot(reader: Reader, body: Node[], exportName?: string): ObjectNode {
  const consts = new Map<string, Node>()
  const candidates: Candidates = new Map()
  const resolve = (node: Node | undefined): ObjectNode | null => {
    for (let hop = 0; node && hop < 5; hop++) {
      node = unwrap(node)
      if (node.type === 'ObjectExpression') return node as ObjectNode
      node = node.type === 'Identifier' ? consts.get((node as Identifier).name) : undefined
    }
    return null
  }
  const declarations = (node: Node) =>
    (node as Node & { declarations: Array<{ id: Node; init: Node | null }> }).declarations

  for (const stmt of body) {
    const decl = stmt.type.startsWith('Export')
      ? ((stmt as Node & { declaration?: Node }).declaration ?? stmt)
      : stmt
    if (decl.type !== 'VariableDeclaration') continue
    for (const d of declarations(decl))
      if (d.id.type === 'Identifier' && d.init) {
        consts.set((d.id as Identifier).name, d.init)
        if (stmt.type === 'ExportNamedDeclaration') candidates.set((d.id as Identifier).name, d.init)
      }
  }
  for (const stmt of body) {
    if (stmt.type === 'ExportDefaultDeclaration') {
      candidates.set('default', (stmt as Node & { declaration: Node }).declaration)
    } else if (stmt.type === 'ExportNamedDeclaration') {
      const specifiers =
        (stmt as Node & { specifiers?: Array<{ local: Node; exported: Node }> }).specifiers ?? []
      for (const s of specifiers) {
        const exported =
          s.exported.type === 'Identifier'
            ? (s.exported as Identifier).name
            : String((s.exported as Literal).value)
        candidates.set(exported, s.local)
      }
    } else if (stmt.type === 'ExpressionStatement') {
      const expr = unwrap((stmt as Wrapper).expression)
      if (expr.type !== 'AssignmentExpression') continue
      const { left, right } = expr as Node & { left: Node; right: Node }
      const target = source(reader.content, left)
      if (target === 'module.exports') candidates.set('default', right)
      else if (/^(module\.)?exports\.[\w$]+$/.test(target)) candidates.set(target.split('.').at(-1)!, right)
    }
  }

  const objects = new Map<string, ObjectNode>()
  for (const [name, node] of candidates) {
    const obj = resolve(node)
    if (obj) objects.set(name, obj)
  }
  if (exportName) {
    const found = objects.get(exportName)
    if (!found) throw new Error(`No exported object \`${exportName}\` found in translation file`)
    return found
  }
  const fallback = objects.get('default') ?? (objects.size === 1 ? [...objects.values()][0] : undefined)
  if (fallback) return fallback
  throw new Error(
    objects.size
      ? `Translation file exports several objects (${[...objects.keys()].join(', ')}), set the export name`
      : 'Translation file must `export default` an object literal (or use `module.exports =`)',
  )
}

function source(content: string, node: Node) {
  return content.slice(node.start, node.end).replace(/\s+/g, '')
}

function parseScript(content: string, exportName?: string) {
  const result = parseSync('translations.ts', content, { lang: 'ts', sourceType: 'module' })
  const error = result.errors[0]
  if (error) {
    const offset = error.labels[0]?.start ?? 0
    throw new Error(`Cannot parse translation file (line ${lineOf(content, offset)}): ${error.message}`)
  }
  const reader = new Reader(content)
  const root = findRoot(reader, result.program.body as Node[], exportName)
  return { reader, root, slots: reader.collect(root) }
}

export function parseScriptFile(content: string, ctx: ParseContext<'script'>): ParseResult<'script'> {
  const { slots } = parseScript(content, ctx.options?.exportName)
  const interpolation = ctx.options?.interpolation ?? detectInterpolation(slots.map((s) => s.text))
  return {
    entries: slots.map((s) => toEntry(s.path.join('.'), s.text, interpolation)),
    options: { exportName: ctx.options?.exportName, interpolation },
  }
}

const escapes: Record<string, string> = {
  '\\': '\\\\',
  '\n': '\\n',
  '\r': '\\r',
  '\u2028': '\\u2028',
  '\u2029': '\\u2029',
}

function quote(text: string, q: string) {
  let out = text.replace(new RegExp('[\\\\\\n\\r\\u2028\\u2029]', 'g'), (c) => escapes[c]!)
  out = q === '`' ? out.replace(/`/g, '\\`').replace(/\$\{/g, '\\${') : out.split(q).join(`\\${q}`)
  return q + out + q
}

const identifier = /^[A-Za-z_$][\w$]*$/

type Edit = { start: number; end: number; text: string }

export function serializeScript(entries: Entry[], ctx: SerializeContext<'script'>): string {
  const exportName = ctx.options?.exportName
  const template = ctx.template ? parseScript(ctx.template, exportName) : undefined
  const interpolation =
    ctx.options?.interpolation ?? (template ? detectInterpolation(template.slots.map((s) => s.text)) : 'icu')
  const text = (entry: Entry) => icuToText(entry.value, interpolation)

  if (!template) {
    const tree: Tree = {}
    for (const entry of entries) setPath(tree, entry.key.split('.'), text(entry))
    return `export default ${renderTree(tree, '', '  ', '"')}\n`
  }

  const content = ctx.template!
  const { root, slots } = template
  const byKey = new Map(entries.map((e) => [e.key, e]))
  const edits: Edit[] = []
  const seen = new Set<string>()
  const firstQuote = slots.map((s) => content[s.node.start]!).find((c) => c === '"' || c === "'" || c === '`')
  const q = firstQuote === '`' ? '"' : (firstQuote ?? '"')
  const unit = /^\t/m.test(content) ? '\t' : '  '

  for (const slot of slots) {
    const key = slot.path.join('.')
    const entry = byKey.get(key)
    if (!entry || seen.has(key)) continue
    seen.add(key)
    const next = text(entry)
    if (next === slot.text) continue
    const raw = content[slot.node.start]
    edits.push({
      start: slot.node.start,
      end: slot.node.end,
      text: quote(next, raw === '`' || raw === "'" || raw === '"' ? raw : q),
    })
  }

  // keys gone from the entries are dropped, keys the file lacks are appended to their object
  const slotKeys = new Set(slots.map((s) => s.path.join('.')))
  for (const slot of slots) {
    if (!byKey.has(slot.path.join('.'))) {
      const removal = removeProperty(content, root, slot.path)
      if (removal) edits.push(removal)
    }
  }
  const additions = new Map<ObjectNode, Tree>()
  for (const entry of entries) {
    if (slotKeys.has(entry.key)) continue
    const [target, rest] = descend(root, entry.key.split('.'))
    if (!target) continue
    const tree = additions.get(target) ?? {}
    additions.set(target, tree)
    setPath(tree, rest, text(entry))
  }
  for (const [obj, tree] of additions) edits.push(insertProperties(content, obj, tree, unit, q))

  let out = content
  for (const edit of edits.sort((a, b) => b.start - a.start))
    out = out.slice(0, edit.start) + edit.text + out.slice(edit.end)
  return out
}

function propsOf(obj: ObjectNode) {
  return obj.properties as Property[]
}

function nameOf(prop: Property): string | null {
  const key = unwrap(prop.key)
  if (key.type === 'Identifier' && !prop.computed) return (key as Identifier).name
  if (key.type === 'Literal') return String((key as Literal).value)
  return null
}

/** Walks as deep as the file already has objects; returns the object and the path still missing below it. */
function descend(root: ObjectNode, path: string[]): [ObjectNode | null, string[]] {
  let obj = root
  for (let i = 0; i < path.length - 1; i++) {
    const prop = propsOf(obj).find((p) => nameOf(p) === path[i])
    if (!prop) return [obj, path.slice(i)]
    const value = unwrap(prop.value)
    if (value.type === 'ObjectExpression') obj = value as ObjectNode
    else if (value.type === 'ArrayExpression') return [null, []]
    else return [obj, [path.slice(i).join('.')]]
  }
  return [obj, [path.at(-1)!]]
}

function removeProperty(content: string, root: ObjectNode, path: string[]): Edit | null {
  let obj = root
  for (let i = 0; i < path.length; i++) {
    const prop = propsOf(obj).find((p) => nameOf(p) === path[i])
    if (!prop) return null
    if (i === path.length - 1) {
      let start = prop.start
      let end = prop.end
      end += /^[ \t]*,/.exec(content.slice(end))?.[0].length ?? 0
      const lineStart = content.lastIndexOf('\n', start - 1) + 1
      const tail = /^[ \t]*\r?\n/.exec(content.slice(end))
      if (tail && /^[ \t]*$/.test(content.slice(lineStart, start))) {
        start = lineStart
        end += tail[0].length
      }
      return { start, end, text: '' }
    }
    const value = unwrap(prop.value)
    if (value.type !== 'ObjectExpression') return null
    obj = value as ObjectNode
  }
  return null
}

function keyText(key: string, q: string) {
  return identifier.test(key) ? key : quote(key, q)
}

function renderTree(tree: Tree, indent: string, unit: string, q: string): string {
  const inner = indent + unit
  const lines = Object.entries(tree).map(([key, value]) =>
    typeof value === 'string'
      ? `${inner}${keyText(key, q)}: ${quote(value, q)}`
      : `${inner}${keyText(key, q)}: ${renderTree(value, inner, unit, q)}`,
  )
  return lines.length ? `{\n${lines.join(',\n')},\n${indent}}` : '{}'
}

function lineIndent(content: string, offset: number) {
  const lineStart = content.lastIndexOf('\n', offset - 1) + 1
  return /^[ \t]*/.exec(content.slice(lineStart))![0]
}

function insertProperties(content: string, obj: ObjectNode, tree: Tree, unit: string, q: string): Edit {
  const props = propsOf(obj)
  const last = props.at(-1)
  const closeIndent = lineIndent(content, obj.start)
  const indent =
    last && content.lastIndexOf('\n', last.start) >= obj.start
      ? lineIndent(content, last.start)
      : closeIndent + unit
  const body = renderTree(tree, indent.slice(0, indent.length - unit.length), unit, q)
  const lines = body.slice(2, body.lastIndexOf('\n')).replace(/,$/, '')
  if (last) return { start: last.end, end: last.end, text: `,\n${lines}` }
  return { start: obj.start + 1, end: obj.end - 1, text: `\n${lines},\n${closeIndent}` }
}
