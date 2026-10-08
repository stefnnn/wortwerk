import { afterAll, describe, expect, it } from 'vitest'
import { createProject, upsertFile } from '../src/projects.ts'
import { exportFileContent, importFileContent } from '../src/files.ts'
import { listKeys, localeStats, setTranslationStatusBulk, splitSelection } from '../src/keys.ts'
import { listRevisions, setTranslation } from '../src/translations.ts'
import { tmSuggestions } from '../src/tm.ts'
import { createTenant, db } from './helpers.ts'

afterAll(() => db.pool.end())

const en = (extra = '') => `{
  "nav": {
    "home": "Home",
    "settings": "Settings"${extra}
  },
  "items_one": "{{count}} item",
  "items_other": "{{count}} items"
}
`

describe('file import / export', () => {
  it("imports source and target files and exports the target's own file with new keys", async () => {
    const ctx = await createTenant()
    const project = await createProject(ctx, {
      name: 'Web',
      slug: 'web',
      sourceLocale: 'en',
      locales: ['de'],
    })
    const file = await upsertFile(ctx, project.id, { path: 'locales/%locale%.json', format: 'json' })

    const source = await importFileContent(ctx, {
      projectId: project.id,
      fileId: file.id,
      locale: 'en',
      content: en(),
    })
    expect(source).toMatchObject({ keysAdded: 3, translationsChanged: 3 })

    const target = await importFileContent(ctx, {
      projectId: project.id,
      fileId: file.id,
      locale: 'de',
      content: '{ "nav": { "home": "Start", "unknown": "x" } }',
    })
    expect(target).toMatchObject({ translationsChanged: 1, skipped: 1 })

    const { items, total } = await listKeys(ctx, project.id, { locale: 'de' })
    expect(total).toBe(3)
    expect(items.map((i) => [i.name, i.source, i.value, i.status])).toEqual([
      ['nav.home', 'Home', 'Start', 'translated'],
      ['nav.settings', 'Settings', null, 'untranslated'],
      ['items', '{count, plural, one {# item} other {# items}}', null, 'untranslated'],
    ])

    await setTranslation(ctx, items.find((i) => i.name === 'items')!.id, 'de', {
      value: '{count, plural, one {# Eintrag} other {# Einträge}}',
    })
    const exported = await exportFileContent(ctx, { fileId: file.id, locale: 'de' })
    expect(exported.path).toBe('locales/de.json')
    expect(exported.content).toBe(`{
  "nav": {
    "home": "Start",
    "unknown": "x"
  },
  "items_one": "{{count}} Eintrag",
  "items_other": "{{count}} Einträge"
}`)
  })

  it("exports a script file by patching the locale's own file, not the source", async () => {
    const ctx = await createTenant()
    const project = await createProject(ctx, {
      name: 'Web',
      slug: 'web',
      sourceLocale: 'en',
      locales: ['bg'],
    })
    const file = await upsertFile(ctx, project.id, { path: 'src/%locale%.ts', format: 'script' })
    const input = { projectId: project.id, fileId: file.id }
    await importFileContent(ctx, {
      ...input,
      locale: 'en',
      content: `const en = {\n  home: "Home",\n  save: "Save",\n} as const;\n\nexport default en;\nexport type Translations = typeof en;\n`,
    })
    const bg = `const bg = {\n  home: 'Начало',\n} as const;\n\nexport default bg;\n`
    await importFileContent(ctx, { ...input, locale: 'bg', content: bg })

    const exported = await exportFileContent(ctx, { fileId: file.id, locale: 'bg' })
    expect(exported.path).toBe('src/bg.ts')
    expect(exported.content).toBe(bg)
  })

  it("exports a yaml file by patching the locale's own file, not the source", async () => {
    const ctx = await createTenant()
    const project = await createProject(ctx, {
      name: 'Web',
      slug: 'web',
      sourceLocale: 'de',
      locales: ['fr'],
    })
    const file = await upsertFile(ctx, project.id, { path: 'config/locales/%locale%.yml', format: 'yaml' })
    const input = { projectId: project.id, fileId: file.id }
    await importFileContent(ctx, {
      ...input,
      locale: 'de',
      content: [
        'de:',
        '  activerecord:',
        '    title: Titel',
        '  common:',
        '    intro: >-',
        '      Ein langer Text,',
        '      der gefaltet ist.',
        '    count:',
        '      one: 1 Kapitel',
        '      other: "%{count} Kapitel"',
        '    extra: Neu',
        '',
      ].join('\n'),
    })
    const fr = [
      'fr:',
      '  nav:',
      '    home: Accueil',
      '  common:',
      '    # kept',
      '    intro: >-',
      '      Un long texte,',
      '      qui est plié.',
      '    count:',
      '      one: 1 chapitre',
      '      other: "%{count} chapitres"',
      '',
    ].join('\n')
    await importFileContent(ctx, { ...input, locale: 'fr', content: fr })

    const { items } = await listKeys(ctx, project.id, { locale: 'fr' })
    await setTranslation(ctx, items.find((i) => i.name === 'activerecord.title')!.id, 'fr', {
      value: 'Titre',
    })
    await setTranslation(ctx, items.find((i) => i.name === 'common.extra')!.id, 'fr', { value: 'Nouveau' })
    await setTranslation(ctx, items.find((i) => i.name === 'common.count')!.id, 'fr', {
      value: '{count, plural, one {1 chapitre} other {# chapitres !}}',
    })

    const exported = await exportFileContent(ctx, { fileId: file.id, locale: 'fr' })
    expect(exported.content).toBe(
      [
        'fr:',
        '  nav:',
        '    home: Accueil',
        '  common:',
        '    # kept',
        '    intro: >-',
        '      Un long texte,',
        '      qui est plié.',
        '    count:',
        '      one: 1 chapitre',
        '      other: "%{count} chapitres !"',
        '    extra: Nouveau',
        '  activerecord:',
        '    title: Titre',
        '',
      ].join('\n'),
    )
  })

  it("exports a po file by patching the locale's own file", async () => {
    const ctx = await createTenant()
    const project = await createProject(ctx, {
      name: 'Web',
      slug: 'web',
      sourceLocale: 'en',
      locales: ['ru'],
    })
    const file = await upsertFile(ctx, project.id, { path: 'po/%locale%.po', format: 'po' })
    const input = { projectId: project.id, fileId: file.id }
    await importFileContent(ctx, {
      ...input,
      locale: 'en',
      content: [
        'msgid ""',
        'msgstr ""',
        '"Language: en\\n"',
        '"Plural-Forms: nplurals=2; plural=(n != 1);\\n"',
        '',
        'msgid "Hello"',
        'msgstr ""',
        '',
        'msgid "Bye"',
        'msgstr ""',
        '',
        'msgid "New"',
        'msgstr ""',
        '',
      ].join('\n'),
    })
    const ru = [
      'msgid ""',
      'msgstr ""',
      '"Language: ru\\n"',
      '"Last-Translator: Ivan\\n"',
      '"Plural-Forms: nplurals=3; plural=(n%10==1 && n%100!=11 ? 0 : 1);\\n"',
      '',
      '# translator note',
      '#, fuzzy',
      'msgid "Hello"',
      'msgstr "Привет"',
      '',
      'msgid "Bye"',
      'msgstr "Пока"',
      '',
      'msgid "Only in repo"',
      'msgstr "Только в репозитории"',
      '',
    ].join('\n')
    await importFileContent(ctx, { ...input, locale: 'ru', content: ru })

    const { items } = await listKeys(ctx, project.id, { locale: 'ru' })
    await setTranslation(ctx, items.find((i) => i.name === 'Hello')!.id, 'ru', { value: 'Здравствуйте' })
    await setTranslation(ctx, items.find((i) => i.name === 'New')!.id, 'ru', { value: 'Новый' })

    const exported = await exportFileContent(ctx, { fileId: file.id, locale: 'ru' })
    expect(exported.content).toBe(
      ru.replace('#, fuzzy\n', '').replace('"Привет"', '"Здравствуйте"') + '\nmsgid "New"\nmsgstr "Новый"\n',
    )
  })

  it('soft-deletes, restores and flags changed source strings', async () => {
    const ctx = await createTenant()
    const project = await createProject(ctx, {
      name: 'Web',
      slug: 'web',
      sourceLocale: 'en',
      locales: ['de'],
    })
    const file = await upsertFile(ctx, project.id, { path: '%locale%.json', format: 'json' })
    const run = (locale: string, content: string) =>
      importFileContent(ctx, { projectId: project.id, fileId: file.id, locale, content })

    await run('en', en(',\n    "about": "About"'))
    await run('de', '{ "nav": { "home": "Start", "about": "Über" } }')

    expect(await run('en', en())).toMatchObject({ keysObsoleted: 1 })
    expect(
      (await listKeys(ctx, project.id, { locale: 'de', obsolete: true })).items.map((i) => i.name),
    ).toEqual(['nav.about'])

    expect(await run('en', en(',\n    "about": "About us"').replace('"Home"', '"Homepage"'))).toMatchObject({
      keysRestored: 1,
      translationsChanged: 2,
    })
    const { items } = await listKeys(ctx, project.id, { locale: 'de', status: 'needs_review' })
    expect(items.map((i) => i.name).sort()).toEqual(['nav.about', 'nav.home'])

    const home = items.find((i) => i.name === 'nav.home')!
    expect((await listRevisions(ctx, home.id, 'de')).length).toBe(1)

    const stats = await localeStats(ctx, project.id)
    expect(stats.find((s) => s.locale === 'de')).toMatchObject({ total: 4, needsReview: 2, untranslated: 2 })
  })

  it('enforces the plan key limit', async () => {
    const ctx = await createTenant()
    const project = await createProject(ctx, { name: 'Big', slug: 'big', sourceLocale: 'en' })
    const file = await upsertFile(ctx, project.id, { path: '%locale%.json', format: 'json' })
    const content = JSON.stringify(
      Object.fromEntries(Array.from({ length: 501 }, (_, i) => [`k${i}`, `v${i}`])),
    )
    await expect(
      importFileContent(ctx, { projectId: project.id, fileId: file.id, locale: 'en', content }),
    ).rejects.toThrow(/allows 500 keys/)
  })

  it('enforces the plan project limit', async () => {
    const ctx = await createTenant()
    await createProject(ctx, { name: 'One', slug: 'one', sourceLocale: 'en' })
    await expect(createProject(ctx, { name: 'Two', slug: 'two', sourceLocale: 'en' })).rejects.toThrow(
      /allows 1 project/,
    )
  })

  it('suggests translations from memory', async () => {
    const ctx = await createTenant('agency')
    const a = await createProject(ctx, { name: 'A', slug: 'a', sourceLocale: 'en', locales: ['de'] })
    const b = await createProject(ctx, { name: 'B', slug: 'b', sourceLocale: 'en', locales: ['de'] })
    const fa = await upsertFile(ctx, a.id, { path: '%locale%.json', format: 'json' })
    const fb = await upsertFile(ctx, b.id, { path: '%locale%.json', format: 'json' })
    await importFileContent(ctx, {
      projectId: a.id,
      fileId: fa.id,
      locale: 'en',
      content: '{"save":"Save changes"}',
    })
    await importFileContent(ctx, {
      projectId: a.id,
      fileId: fa.id,
      locale: 'de',
      content: '{"save":"Änderungen speichern"}',
    })
    await importFileContent(ctx, {
      projectId: b.id,
      fileId: fb.id,
      locale: 'en',
      content: '{"store":"Save all changes"}',
    })
    const { items } = await listKeys(ctx, b.id, { locale: 'de' })
    const suggestions = await tmSuggestions(ctx, items[0]!.id, 'de')
    expect(suggestions).toHaveLength(1)
    expect(suggestions[0]).toMatchObject({
      value: 'Änderungen speichern',
      source: 'Save changes',
      projectName: 'A',
    })
  })

  it('lists one row per key and target locale for all languages', async () => {
    const ctx = await createTenant()
    const project = await createProject(ctx, {
      name: 'Web',
      slug: 'web',
      sourceLocale: 'en',
      locales: ['de', 'fr'],
    })
    const file = await upsertFile(ctx, project.id, { path: 'locales/%locale%.json', format: 'json' })
    await importFileContent(ctx, {
      projectId: project.id,
      fileId: file.id,
      locale: 'en',
      content: '{ "a": "A", "b": "B" }',
    })
    const [a] = (await listKeys(ctx, project.id, { locale: 'de' })).items
    await setTranslation(ctx, a!.id, 'de', { value: 'A-de' })

    const everything = await listKeys(ctx, project.id, { locale: 'all' })
    expect(everything.total).toBe(4)
    expect(everything.items.map((i) => [i.name, i.locale, i.status])).toEqual([
      ['a', 'de', 'translated'],
      ['a', 'fr', 'untranslated'],
      ['b', 'de', 'untranslated'],
      ['b', 'fr', 'untranslated'],
    ])
    const missing = await listKeys(ctx, project.id, { locale: 'all', status: 'untranslated' })
    expect(missing.total).toBe(3)
  })

  it('splits a selection across locales into per-locale selections', async () => {
    const ctx = await createTenant()
    const project = await createProject(ctx, {
      name: 'Web',
      slug: 'web',
      sourceLocale: 'en',
      locales: ['de', 'fr'],
    })
    const file = await upsertFile(ctx, project.id, { path: 'locales/%locale%.json', format: 'json' })
    await importFileContent(ctx, {
      projectId: project.id,
      fileId: file.id,
      locale: 'en',
      content: '{ "a": "A", "b": "B" }',
    })
    const [a, b] = (await listKeys(ctx, project.id, { locale: 'de' })).items
    await setTranslation(ctx, a!.id, 'de', { value: 'A-de' })
    await setTranslation(ctx, a!.id, 'fr', { value: 'A-fr' })
    await setTranslation(ctx, b!.id, 'fr', { value: 'B-fr' })

    const rows = await splitSelection(ctx, project.id, 'all', {
      rows: [
        { keyId: a!.id, locale: 'de' },
        { keyId: a!.id, locale: 'fr' },
        { keyId: b!.id, locale: 'fr' },
      ],
    })
    expect(rows).toEqual([
      { locale: 'de', selection: { keyIds: [a!.id] } },
      { locale: 'fr', selection: { keyIds: [a!.id, b!.id] } },
    ])

    // everything matching, minus one unticked row
    const parts = await splitSelection(ctx, project.id, 'all', {
      filter: { locale: 'all', status: 'translated' },
      excludeRows: [{ keyId: a!.id, locale: 'fr' }],
    })
    let updated = 0
    for (const part of parts)
      updated += (await setTranslationStatusBulk(ctx, project.id, part.locale, 'approved', part.selection))
        .updated
    expect(updated).toBe(2)
    const all = await listKeys(ctx, project.id, { locale: 'all', status: 'approved' })
    expect(all.items.map((i) => [i.name, i.locale])).toEqual([
      ['a', 'de'],
      ['b', 'fr'],
    ])
  })
})
