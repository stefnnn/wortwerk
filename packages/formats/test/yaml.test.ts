import { describe, expect, it } from 'vitest'
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
