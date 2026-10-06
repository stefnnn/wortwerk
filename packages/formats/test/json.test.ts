import { describe, expect, it } from 'vitest'
import { parseJson, serializeJson } from '../src/json.ts'

const i18next = `{
    "app": {
        "title": "Hello {{name}}",
        "items_one": "{{count}} item",
        "items_other": "{{count}} items"
    },
    "bye": "Bye"
}
`

describe('json', () => {
  it('parses nested i18next files', () => {
    const { entries, options } = parseJson(i18next, { locale: 'en' })
    expect(options).toEqual({ style: 'nested', plurals: 'i18next', interpolation: 'i18next' })
    expect(entries).toEqual([
      { key: 'app.title', value: 'Hello {name}', isPlural: false },
      { key: 'app.items', value: '{count, plural, one {# item} other {# items}}', isPlural: true },
      { key: 'bye', value: 'Bye', isPlural: false },
    ])
  })

  it('round-trips with the source file as template', () => {
    const { entries } = parseJson(i18next, { locale: 'en' })
    expect(serializeJson(entries, { locale: 'en', template: i18next })).toBe(i18next)
  })

  it('exports target plural categories and drops untranslated keys', () => {
    const out = serializeJson(
      [
        {
          key: 'app.items',
          value: '{count, plural, one {# Ding} few {# Dinge} many {# Dinger} other {# Dinge}}',
          isPlural: true,
        },
      ],
      { locale: 'ru', template: i18next },
    )
    expect(JSON.parse(out)).toEqual({
      app: {
        items_one: '{{count}} Ding',
        items_few: '{{count}} Dinge',
        items_many: '{{count}} Dinger',
        items_other: '{{count}} Dinge',
      },
    })
  })

  it('handles flat ICU files and appends new keys', () => {
    const flat =
      '{\n  "a.b": "One {n, plural, one {#} other {#}}",\n  "c": "{n, plural, one {# x} other {# xs}}"\n}\n'
    const { entries, options } = parseJson(flat, { locale: 'en' })
    expect(options.style).toBe('flat')
    expect(entries[1]!.isPlural).toBe(true)
    const out = serializeJson([...entries, { key: 'new.key', value: 'New', isPlural: false }], {
      locale: 'de',
      template: flat,
    })
    expect(JSON.parse(out)).toEqual({ ...JSON.parse(flat), 'new.key': 'New' })
  })
})
