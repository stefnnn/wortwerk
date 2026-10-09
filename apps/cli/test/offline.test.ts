import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { lintProject } from '../src/commands/lint.ts'
import { detectPatterns, parseRemoteUrl } from '../src/project.ts'

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
