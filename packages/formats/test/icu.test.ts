import { describe, expect, it } from 'vitest'
import { parse } from '@formatjs/icu-messageformat-parser'
import {
  buildPluralIcu,
  icuArguments,
  icuToText,
  parsePluralIcu,
  textToIcu,
  validateIcu,
} from '../src/icu.ts'
import { pluralIndexCategories } from '../src/plural-forms.ts'
import { structureIssue } from '../src/icu.ts'

describe('structureIssue', () => {
  const plural = '{count, plural, one {# item} other {# items}}'

  it('judges source text by the repo plural forms, not the locale', () => {
    // French wants "many" too, but a repo text without it is still editable
    expect(
      structureIssue(plural, '{count, plural, one {# thing} other {# things}}', 'fr', 'source'),
    ).toBeNull()
    expect(structureIssue(plural, '{count, plural, one {# thing} other {# things}}', 'fr')).toEqual({
      kind: 'pluralForms',
      missing: ['many'],
    })
    expect(structureIssue(plural, '{count, plural, other {# things}}', 'en', 'source')).toEqual({
      kind: 'pluralForms',
      missing: ['one'],
    })
  })

  it('does not let source text become or stop being a plural', () => {
    expect(structureIssue('{count} items', plural, 'en', 'source')).toEqual({ kind: 'plural' })
    expect(structureIssue(plural, '{count} items', 'en', 'source')).toEqual({ kind: 'plural' })
    expect(structureIssue('{count} items', plural, 'en')).toBeNull()
  })
})

describe('icu', () => {
  it.each([
    'Hello {{name}}!',
    "don't {{x}} it's",
    'literal { brace } and {{x}}',
    "quote before brace '{",
    "two quotes '' then {",
  ])('round-trips i18next text %s', (text) => {
    const icu = textToIcu(text, 'i18next')
    expect(validateIcu(icu)).toBeNull()
    expect(icuToText(icu, 'i18next')).toBe(text)
  })

  it('converts rails placeholders', () => {
    expect(textToIcu('Hi %{name}', 'rails')).toBe('Hi {name}')
    expect(icuToText('Hi {name}', 'rails')).toBe('Hi %{name}')
  })

  it('maps count to pound inside plurals', () => {
    const branch = textToIcu('{{count}} items #1', 'i18next', true)
    expect(branch).toBe("# items '#'1")
    expect(icuToText(branch, 'i18next', true)).toBe('{{count}} items #1')
  })

  it('builds and parses plural messages', () => {
    const icu = buildPluralIcu({ other: '# items', one: 'one item', '=0': 'none' })
    expect(icu).toBe('{count, plural, =0 {none} one {one item} other {# items}}')
    expect(parse(icu)).toHaveLength(1)
    expect(parsePluralIcu(icu)).toEqual({
      variable: 'count',
      branches: { '=0': 'none', one: 'one item', other: '# items' },
    })
    expect(parsePluralIcu('Hello {name}')).toBeNull()
  })

  it('lists arguments', () => {
    expect(icuArguments('{n, plural, one {{name} has #} other {{name} and {other}}}')).toEqual([
      'n',
      'name',
      'other',
    ])
  })

  it('maps gettext plural indices to CLDR categories', () => {
    expect(pluralIndexCategories('en', 'nplurals=2; plural=(n != 1);')).toEqual(['one', 'other'])
    expect(
      pluralIndexCategories(
        'ru',
        'nplurals=3; plural=(n%10==1 && n%100!=11 ? 0 : n%10>=2 && n%10<=4 && (n%100<10 || n%100>=20) ? 1 : 2);',
      ),
    ).toEqual(['one', 'few', 'many'])
    expect(pluralIndexCategories('ja', 'nplurals=1; plural=0;')).toEqual(['other'])
  })
})
