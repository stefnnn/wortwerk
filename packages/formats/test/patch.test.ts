import { describe, expect, it } from 'vitest'
import { patchFile } from '../src/index.ts'

// pushing edited source text must change exactly the edited lines

const json = `{
    "app": {
        "title": "Hello {{name}}",
        "items_one": "{{count}} item",
        "items_other": "{{count}} items"
    },
    "bye": "Bye"
}
`

const yaml = `en:
  # greeting shown on the dashboard
  hello: "Hello %{name}"
  inbox:
    one: "%{count} message"
    other: "%{count} messages"
  nested:
    title: Title
`

const po = `msgid ""
msgstr ""
"Language: en\\n"
"Content-Type: text/plain; charset=UTF-8\\n"
"Plural-Forms: nplurals=2; plural=(n != 1);\\n"

#. shown in header
#: src/app.py:10
msgid "Hello"
msgstr ""

msgid "One file"
msgid_plural "%d files"
msgstr[0] ""
msgstr[1] ""

msgctxt "menu"
msgid "Open"
msgstr "Open…"
`

describe('patchFile', () => {
  it('leaves untouched files byte for byte identical', () => {
    expect(patchFile('json', json, () => undefined, { locale: 'en', isSource: true })).toBe(json)
    expect(patchFile('yaml', yaml, () => undefined, { locale: 'en', isSource: true })).toBe(yaml)
    expect(patchFile('po', po, () => undefined, { locale: 'en', isSource: true })).toBe(po)
  })

  it('changes only the edited values', () => {
    const replace = (values: Record<string, string>) => (e: { key: string }) => values[e.key]
    expect(
      patchFile(
        'json',
        json,
        replace({
          'app.title': 'Hi {name}',
          'app.items': '{count, plural, one {# thing} other {# things}}',
        }),
        { locale: 'en', isSource: true },
      ),
    ).toBe(
      json
        .replace('Hello {{name}}', 'Hi {{name}}')
        .replace('{{count}} item"', '{{count}} thing"')
        .replace('{{count}} items', '{{count}} things'),
    )
    expect(
      patchFile('yaml', yaml, replace({ hello: 'Welcome {name}' }), { locale: 'en', isSource: true }),
    ).toBe(yaml.replace('Hello %{name}', 'Welcome %{name}'))
    expect(patchFile('po', po, replace({ Hello: 'Hello there' }), { locale: 'en', isSource: true })).toBe(
      po.replace('msgid "Hello"\nmsgstr ""', 'msgid "Hello"\nmsgstr "Hello there"'),
    )
  })

  it('patches po plurals, contexts, quotes and folded strings in place', () => {
    const folded = `${po}
msgid ""
"A long "
"text"
msgstr ""
`
    const out = patchFile(
      'po',
      folded,
      (e) =>
        ({
          'One file': '{count, plural, one {One "file"} other {%d files}}',
          Open: 'Open\tnow',
          'A long text': 'A short\ntext',
        })[e.key],
      { locale: 'en', isSource: true },
    )
    expect(out).toBe(
      folded
        .replace('msgstr[0] ""\nmsgstr[1] ""', 'msgstr[0] "One \\"file\\""\nmsgstr[1] "%d files"')
        .replace('msgstr "Open…"', 'msgstr "Open\\tnow"')
        .replace('"text"\nmsgstr ""', '"text"\nmsgstr "A short\\ntext"'),
    )
  })
})
