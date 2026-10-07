import { parseJson, serializeJson } from './json.ts'
import { parsePo, patchPo, serializePo } from './po.ts'
import type { Entry, FileFormat, ParseContext, ParseResult, SerializeContext } from './types.ts'
import { parseYaml, serializeYaml } from './yaml.ts'

export * from './types.ts'
export * from './icu.ts'
export { defaultPluralForms } from './plural-forms.ts'

export const fileFormats: FileFormat[] = ['json', 'yaml', 'po']

const adapters: {
  [F in FileFormat]: {
    parse: (content: string, ctx: ParseContext<F>) => ParseResult<F>
    serialize: (entries: Entry[], ctx: SerializeContext<F>) => string
  }
} = {
  json: { parse: parseJson, serialize: serializeJson },
  yaml: { parse: parseYaml, serialize: serializeYaml },
  po: { parse: parsePo, serialize: serializePo },
}

export function parseFile<F extends FileFormat>(
  format: F,
  content: string,
  ctx: ParseContext<F>,
): ParseResult<F> {
  return adapters[format].parse(content, ctx)
}

export function serializeFile<F extends FileFormat>(
  format: F,
  entries: Entry[],
  ctx: SerializeContext<F>,
): string {
  return adapters[format].serialize(entries, ctx)
}

export function formatFromPath(path: string): FileFormat | null {
  const ext = path.split('.').pop()?.toLowerCase()
  if (ext === 'json') return 'json'
  if (ext === 'yml' || ext === 'yaml') return 'yaml'
  if (ext === 'po' || ext === 'pot') return 'po'
  return null
}

/**
 * Rewrites `content` with some values replaced, using the file itself as the template so key order,
 * nesting and comments stay put. `replace` returns the new value for an entry, or undefined to keep it.
 */
export function patchFile<F extends FileFormat>(
  format: F,
  content: string,
  replace: (entry: Entry) => string | undefined,
  ctx: ParseContext<F>,
): string {
  const parsed = parseFile(format, content, ctx)
  const entries = parsed.entries.map((entry) => {
    const value = replace(entry)
    return value === undefined ? entry : { ...entry, value }
  })
  if (format === 'po') {
    const changed = entries.filter((entry, index) => entry !== parsed.entries[index])
    return patchPo(content, changed, ctx as ParseContext<'po'>)
  }
  return serializeFile(format, entries, { ...ctx, options: ctx.options ?? parsed.options, template: content })
}
