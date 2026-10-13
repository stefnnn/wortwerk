import { describe, expect, it } from 'vitest'
import { formatFromPath, parseFile, patchFile, serializeFile } from '../src/index.ts'

const ctx = { locale: 'en', isSource: true } as const

const ts = `// app messages
const en = {
  appName: "CivicTools",
  header: {
    brand: 'Voty \\'CivicTools\\'', // brand
    'nav-home': \`Home\`,
  },
  items: "{count, plural, one {# item} other {# items}}",
  version: 2,
} as const

export type En = typeof en
export default en
`

const parse = (content: string, options?: { exportName?: string }) =>
  parseFile('script', content, { ...ctx, options })

describe('script format', () => {
  it('maps extensions', () => {
    for (const ext of ['ts', 'mts', 'cts', 'js', 'mjs', 'cjs'])
      expect(formatFromPath(`a/en.${ext}`)).toBe('script')
  })

  it('reads a const exported as default', () => {
    const { entries } = parse(ts)
    expect(entries.map((e) => [e.key, e.value, e.isPlural])).toEqual([
      ['appName', 'CivicTools', false],
      ['header.brand', "Voty 'CivicTools'", false],
      ['header.nav-home', 'Home', false],
      ['items', '{count, plural, one {# item} other {# items}}', true],
    ])
  })

  it('reads the common export shapes', () => {
    const bodies = [
      `export default { a: "x" }`,
      `export default { a: "x" } satisfies Messages`,
      `export const en = { a: "x" }`,
      `const en: Messages = { a: "x" }\nexport { en as default }`,
      `module.exports = { a: "x" }`,
      `exports.messages = { a: "x" }`,
      `const en = { a: "x" }\nconst alias = en\nexport default alias`,
    ]
    for (const body of bodies)
      expect(parse(body).entries).toEqual([expect.objectContaining({ key: 'a', value: 'x' })])
  })

  it('folds string concatenation and indexes arrays', () => {
    const { entries } = parse(`export default { a: "x" + "y", list: ["one", \`two\`] }`)
    expect(entries.map((e) => [e.key, e.value])).toEqual([
      ['a', 'xy'],
      ['list.0', 'one'],
      ['list.1', 'two'],
    ])
  })

  it('needs an export name when several objects are exported', () => {
    const content = `export const en = { a: "x" }\nexport const de = { a: "y" }`
    expect(() => parse(content)).toThrow(/several objects \(en, de\)/)
    expect(parse(content, { exportName: 'de' }).entries[0]!.value).toBe('y')
    expect(() => parse(content, { exportName: 'fr' })).toThrow(/No exported object/)
  })

  it('rejects anything dynamic with a line number', () => {
    expect(() => parse(`export default { a: "x",\n b: t("y") }`)).toThrow(
      /`b` is not a static string \(line 2\)/,
    )
    expect(() => parse('export default { a: `x ${1}` }')).toThrow(/not a static string/)
    expect(() => parse(`const o = {}\nexport default { ...o }`)).toThrow(/plain `key: value`/)
    expect(() => parse(`export default { a }`)).toThrow(/plain `key: value`/)
    expect(() => parse(`export default { [k]: "x" }`)).toThrow(/Computed keys/)
    expect(() => parse(`export default fn()`)).toThrow(/export default/)
    expect(() => parse(`export default {`)).toThrow(/Cannot parse/)
  })

  it('never executes the file', () => {
    expect(() => parse(`globalThis.pwned = 1\nexport default { a: "x" }`)).not.toThrow()
    expect((globalThis as Record<string, unknown>).pwned).toBeUndefined()
  })

  it('leaves untouched files byte for byte identical', () => {
    expect(patchFile('script', ts, () => undefined, ctx)).toBe(ts)
  })

  it('patches only the edited values and keeps quote style', () => {
    const out = patchFile(
      'script',
      ts,
      (e) => ({ appName: 'Civic "Tools"', 'header.brand': "It's Voty", 'header.nav-home': 'Start' })[e.key],
      ctx,
    )
    expect(out).toBe(
      ts
        .replace('"CivicTools"', '"Civic \\"Tools\\""')
        .replace("'Voty \\'CivicTools\\''", "'It\\'s Voty'")
        .replace('`Home`', '`Start`'),
    )
  })

  it('adds missing keys, also into nested objects, and drops removed ones', () => {
    const { entries } = parse(ts)
    const next = [
      ...entries.filter((e) => e.key !== 'appName'),
      { key: 'header.title', value: 'Title', isPlural: false },
      { key: 'footer.legal.imprint', value: 'Imprint', isPlural: false },
    ]
    const out = serializeFile('script', next, { ...ctx, template: ts })
    expect(out).not.toContain('appName')
    expect(out).toContain(`    'nav-home': \`Home\`,\n    title: "Title",\n`)
    expect(out).toContain(`  version: 2,\n`)
    expect(parse(out).entries.map((e) => e.key)).toEqual([
      'header.brand',
      'header.nav-home',
      'header.title',
      'items',
      'footer.legal.imprint',
    ])
  })

  it('adds keys to empty objects and to files without trailing commas', () => {
    const out = serializeFile(
      'script',
      [
        { key: 'a', value: 'x', isPlural: false },
        { key: 'b.c', value: 'y', isPlural: false },
      ],
      { ...ctx, template: `export default {\n  a: "x",\n  b: {}\n}\n` },
    )
    expect(out).toBe(`export default {\n  a: "x",\n  b: {\n    c: "y",\n  }\n}\n`)
  })

  it('writes a new file from scratch', () => {
    const out = serializeFile(
      'script',
      [
        { key: 'a', value: 'x "q"', isPlural: false },
        { key: 'b.c-d', value: 'y', isPlural: false },
      ],
      { locale: 'de' },
    )
    expect(out).toBe(
      `export default {\n  a: "x \\"q\\"",\n  b: {\n    'c-d': "y",\n  },\n}\n`.replace("'c-d'", '"c-d"'),
    )
    expect(parse(out).entries.map((e) => [e.key, e.value])).toEqual([
      ['a', 'x "q"'],
      ['b.c-d', 'y'],
    ])
  })

  it('works for plain javascript with module.exports', () => {
    const js = `module.exports = {\n  hi: 'Hi',\n}\n`
    expect(patchFile('script', js, () => 'Hello', ctx)).toBe(`module.exports = {\n  hi: 'Hello',\n}\n`)
  })
})
