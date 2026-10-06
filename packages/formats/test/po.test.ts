import { describe, expect, it } from 'vitest'
import { parsePo, serializePo } from '../src/po.ts'

const de = `msgid ""
msgstr ""
"Language: de\\n"
"Content-Type: text/plain; charset=UTF-8\\n"
"Plural-Forms: nplurals=2; plural=(n != 1);\\n"

#. shown in header
#: src/app.py:10
msgid "Hello"
msgstr "Hallo"

#, fuzzy
msgctxt "menu"
msgid "Open"
msgstr "Öffnen"

msgid "One file"
msgid_plural "%d files"
msgstr[0] "Eine Datei"
msgstr[1] "%d Dateien"

msgid "Untranslated"
msgstr ""
`

describe('po', () => {
  it('parses entries, contexts, plurals and fuzzy flags', () => {
    const { entries } = parsePo(de, { locale: 'de' })
    expect(entries).toEqual([
      { key: 'Hello', context: '', value: 'Hallo', isPlural: false, description: 'shown in header' },
      {
        key: 'One file',
        context: '',
        value: '{count, plural, one {Eine Datei} other {%d Dateien}}',
        isPlural: true,
      },
      { key: 'Open', context: 'menu', value: 'Öffnen', isPlural: false, needsReview: true },
    ])
  })

  it('uses msgid as source value', () => {
    const { entries } = parsePo(de.replaceAll(/msgstr(\[\d\])? ".+"/g, 'msgstr$1 ""'), {
      locale: 'en',
      isSource: true,
    })
    expect(entries.map((e) => e.value)).toEqual([
      'Hello',
      '{count, plural, one {One file} other {%d files}}',
      'Untranslated',
      'Open',
    ])
  })

  it('exports keeping order, comments and untranslated entries', () => {
    const { entries } = parsePo(de, { locale: 'de' })
    const out = serializePo(
      entries.map((e) => ({ ...e, needsReview: false })),
      { locale: 'de', template: de },
    )
    const again = parsePo(out, { locale: 'de' }).entries
    expect(again.map((e) => [e.key, e.value])).toEqual(entries.map((e) => [e.key, e.value]))
    expect(out).toContain('#: src/app.py:10')
    expect(out).toContain('msgid "Untranslated"')
    expect(out).not.toContain('fuzzy')
  })

  it('creates new files with plural forms for the locale', () => {
    const out = serializePo(
      [
        {
          key: 'One file',
          value: '{count, plural, one {# plik} few {# pliki} many {# plików} other {# pliku}}',
          isPlural: true,
          source: '{count, plural, one {One file} other {# files}}',
        },
      ],
      { locale: 'pl' },
    )
    expect(out).toContain('Plural-Forms: nplurals=3;')
    expect(out).toContain('msgid_plural "# files"')
    expect(out).toContain('msgstr[2] "# plików"')
  })
})
