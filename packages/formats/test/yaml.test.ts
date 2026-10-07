import { describe, expect, it } from 'vitest'
import { patchFile } from '../src/index.ts'
import { parseYaml, serializeYaml } from '../src/yaml.ts'

const rails = `en:
  # greeting shown on the dashboard
  hello: "Hello %{name}"
  inbox:
    one: "%{count} message"
    other: "%{count} messages"
  nested:
    title: Title
`

describe('yaml', () => {
  it('parses rails files', () => {
    const { entries, options } = parseYaml(rails, { locale: 'en' })
    expect(options).toEqual({ rootLocaleKey: true, interpolation: 'rails' })
    expect(entries).toEqual([
      { key: 'hello', value: 'Hello {name}', isPlural: false },
      { key: 'inbox', value: '{count, plural, one {# message} other {# messages}}', isPlural: true },
      { key: 'nested.title', value: 'Title', isPlural: false },
    ])
  })

  it('round-trips with comments', () => {
    const { entries } = parseYaml(rails, { locale: 'en' })
    expect(serializeYaml(entries, { locale: 'en', template: rails })).toBe(rails)
  })

  it('exports a target locale from the source template', () => {
    const out = serializeYaml(
      [
        { key: 'hello', value: 'Hallo {name}', isPlural: false },
        { key: 'inbox', value: '{count, plural, one {# Nachricht} other {# Nachrichten}}', isPlural: true },
        { key: 'extra.key', value: 'Neu', isPlural: false },
      ],
      { locale: 'de', template: rails },
    )
    expect(out).toBe(`de:
  # greeting shown on the dashboard
  hello: "Hallo %{name}"
  inbox:
    one: "%{count} Nachricht"
    other: "%{count} Nachrichten"
  extra:
    key: Neu
`)
  })
})

describe('yaml lists', () => {
  const template = ['de:', '  intro: plain', '  list:', '    - one', '    - two', ''].join('\n')

  it('keeps lists when nothing changed', () => {
    const { entries } = parseYaml(template, { locale: 'de' })
    expect(entries.map((e) => e.key)).toEqual(['intro', 'list.0', 'list.1'])
    expect(serializeYaml(entries, { locale: 'de', template })).toBe(template)
  })

  it('edits a list item in place', () => {
    const { entries } = parseYaml(template, { locale: 'de' })
    const edited = entries.map((e) => (e.key === 'list.1' ? { ...e, value: 'zwei' } : e))
    expect(serializeYaml(edited, { locale: 'de', template })).toBe(template.replace('two', 'zwei'))
  })
})

describe('patchFile on yaml', () => {
  const template = [
    '# top',
    'de:',
    '  intro: >-',
    '    A long folded',
    '    text.',
    '  list:',
    '    - one',
    '    - two',
    '  other: x',
    '',
  ].join('\n')

  it('changes only the edited scalars', () => {
    const out = patchFile(
      'yaml',
      template,
      (e) => (e.key === 'list.1' ? 'zwei' : e.key === 'intro' ? 'Neu' : undefined),
      { locale: 'de', isSource: true },
    )
    expect(out).toBe(template.replace('>-\n    A long folded\n    text.\n', 'Neu\n').replace('two', 'zwei'))
  })
})

describe('serializeYaml with a template', () => {
  const template = [
    'de:',
    '  # note',
    '  a: >-',
    '    folded',
    '    text',
    '  b: gone',
    '  c: keep',
    '',
  ].join('\n')

  it('drops missing keys and keeps the rest byte-for-byte', () => {
    const { entries } = parseYaml(template, { locale: 'de' })
    const out = serializeYaml(
      entries.filter((e) => e.key !== 'b'),
      { locale: 'de', template },
    )
    expect(out).toBe(template.replace('  b: gone\n', ''))
  })
})
