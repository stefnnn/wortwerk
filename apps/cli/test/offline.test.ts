import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { lintProject } from '../src/commands/lint.ts'
import { detectPatterns, discoverProject, isLocaleCode, parseRemoteUrl } from '../src/project.ts'

let root: string

async function files(tree: Record<string, string>) {
  root = await mkdtemp(join(tmpdir(), 'wortwerk-cli-'))
  for (const [path, content] of Object.entries(tree)) {
    await mkdir(dirname(join(root, path)), { recursive: true })
    await writeFile(join(root, path), content)
  }
}

afterEach(() => rm(root, { recursive: true, force: true }))

describe('detectPatterns', () => {
  it('finds locale folders and locale file names, skipping dependencies', async () => {
    await files({
      'src/locales/en.json': '{}',
      'src/locales/de.json': '{}',
      'config/locales/en/app.yml': '',
      'config/locales/fr/app.yml': '',
      'po/messages.en.po': '',
      'node_modules/lib/locales/en.json': '{}',
      'package.json': '{}',
    })
    const found = await detectPatterns(root, 'en')
    expect(found).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'src/locales/%locale%.json', format: 'json', locales: ['de', 'en'] }),
        expect.objectContaining({
          path: 'config/locales/%locale%/app.yml',
          format: 'yaml',
          locales: ['en', 'fr'],
        }),
        expect.objectContaining({ path: 'po/messages.%locale%.po', format: 'po', locales: ['en'] }),
      ]),
    )
    expect(found.some((f) => f.path.startsWith('node_modules'))).toBe(false)
    expect(found[0]!.locales.length).toBe(2)
  })

  it('ignores folders, tooling files and source code that merely look like locales', async () => {
    await files({
      'apps/api/package.json': '{}',
      'apps/web/tsconfig.json': '{}',
      'apps/web/vite.config.ts': 'export default {}',
      'apps/web/src/routeTree.gen.ts': 'export const a = 1',
      'apps/web/src/lib/errors.ts': 'export const a = 1',
      'apps/web/public/sw.js': '',
      'apps/api/src/services/db.ts': 'export const a = 1',
      'packages/ui/src/index.ts': 'export const a = 1',
      'packages/i18n/src/locales/web.en.ts': "export default { hello: 'Hello' }",
      'packages/i18n/src/locales/web.de.ts': "export default { hello: 'Hallo' }",
    })
    const found = await detectPatterns(root)
    expect(found.map((f) => f.path)).toEqual(['packages/i18n/src/locales/web.%locale%.ts'])
    const project = await discoverProject(root)
    expect(project.locales).toEqual(['de', 'en'])
    expect(project.sourceLocale).toBe('en')
  })

  it('still detects a project that only has its source locale', async () => {
    await files({ 'src/locales/en.json': '{"a":"A"}', 'src/api/index.ts': '' })
    const found = await detectPatterns(root, 'en')
    expect(found).toEqual([expect.objectContaining({ path: 'src/locales/%locale%.json', locales: ['en'] })])
  })

  it('accepts language codes with script and region only', () => {
    for (const code of ['en', 'de', 'pt-BR', 'zh_Hant', 'fr_CH', 'es-419', 'fil'])
      expect(isLocaleCode(code)).toBe(true)
    for (const code of ['api', 'app', 'src', 'lib', 'db', 'web', 'ws', 'use-config', 'EN'])
      expect(isLocaleCode(code)).toBe(false)
  })

  it('normalizes GitHub and Bitbucket remote URLs without retaining credentials', () => {
    expect(parseRemoteUrl('git@github.com:acme/shop.git')).toEqual({ provider: 'github', repo: 'acme/shop' })
    expect(parseRemoteUrl('https://token@bitbucket.org/acme/shop.git')).toEqual({
      provider: 'bitbucket',
      repo: 'acme/shop',
    })
    expect(parseRemoteUrl('ssh://git@git.example.com/acme/shop.git')).toBeNull()
  })
})

describe('lintProject', () => {
  const config = {
    project: 'p',
    sourceLocale: 'en',
    locales: ['en', 'de', 'fr'],
    files: [{ path: 'locales/%locale%.json', format: 'json' as const }],
    localeAliases: { fr: 'fr-CH' },
  }

  it('reports placeholder, plural and unknown-key problems per file', async () => {
    await files({
      'locales/en.json': JSON.stringify({
        hi: 'Hello {name}',
        items: '{count, plural, one {# item} other {# items}}',
        bold: 'Click <b>here</b>',
      }),
      'locales/de.json': JSON.stringify({
        hi: 'Hallo {nme}',
        items: '{count, plural, one {# Artikel} other {# Artikel}}',
        bold: 'Klick hier',
        stale: 'Alt',
      }),
      'locales/fr-CH.json': JSON.stringify({ items: '{count, plural, other {# articles}}' }),
    })
    const { issues, checked } = await lintProject(root, config)
    expect(checked).toBe(2)
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'locales/de.json', key: 'hi', level: 'error' }),
        expect.objectContaining({ path: 'locales/de.json', key: 'bold', message: 'markup changed' }),
        expect.objectContaining({ path: 'locales/de.json', key: 'stale', level: 'warning' }),
        expect.objectContaining({
          path: 'locales/fr-CH.json',
          key: 'items',
          message: expect.stringContaining('one'),
        }),
      ]),
    )
    expect(issues.filter((i) => i.key === 'items' && i.path === 'locales/de.json')).toEqual([])
  })

  it('passes clean files and skips missing translations', async () => {
    await files({
      'locales/en.json': JSON.stringify({ hi: 'Hello {name}' }),
      'locales/de.json': JSON.stringify({ hi: 'Hallo {name}' }),
    })
    expect(await lintProject(root, config)).toEqual({ issues: [], checked: 1 })
  })
})
