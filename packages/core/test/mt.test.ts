import { afterAll, describe, expect, it } from 'vitest'
import { db as testDb, createTenant } from './helpers.ts'
import { checkMachineOutput, machineTranslateProject, normalizeModel, type Translator } from '../src/mt.ts'
import { createProject, upsertFile } from '../src/projects.ts'
import { importFileContent } from '../src/files.ts'
import { listKeys } from '../src/keys.ts'
import { listRevisions } from '../src/translations.ts'

afterAll(() => testDb.pool.end())

describe('machine output checks', () => {
  it('accepts faithful output and rejects broken placeholders, markup and plurals', () => {
    expect(checkMachineOutput('Hello {name}', 'Hallo {name}', 'de')).toBeNull()
    expect(checkMachineOutput('Hello {name}', 'Hallo {Name}', 'de')).toMatch(/placeholders/)
    expect(checkMachineOutput('Hello {name}', 'Hallo {name', 'de')).toMatch(/invalid ICU/)
    expect(checkMachineOutput('<b>Hi</b>', 'Hallo', 'de')).toMatch(/markup/)
    const plural = '{count, plural, one {# item} other {# items}}'
    expect(checkMachineOutput(plural, '{count, plural, one {# Element} other {# Elemente}}', 'de')).toBeNull()
    expect(checkMachineOutput(plural, '{count, plural, other {# Elemente}}', 'de')).toMatch(/one/)
    expect(
      checkMachineOutput(
        plural,
        '{count, plural, one {# element} few {# elementy} many {# elementów} other {# elementu}}',
        'pl',
      ),
    ).toBeNull()
    expect(normalizeModel('gpt-6-luna')).toBe('openai/gpt-6-luna')
  })
})

describe('machineTranslateProject', () => {
  const source = '{ "greeting": "Hello {name}", "bye": "Bye", "done": "Done" }'

  async function setup(plan: string) {
    const ctx = await createTenant(plan)
    const project = await createProject(ctx, {
      name: 'App',
      slug: 'app',
      sourceLocale: 'en',
      locales: ['de'],
    })
    const file = await upsertFile(ctx, project.id, { path: '%locale%.json', format: 'json' })
    await importFileContent(ctx, { projectId: project.id, fileId: file.id, locale: 'en', content: source })
    await importFileContent(ctx, {
      projectId: project.id,
      fileId: file.id,
      locale: 'de',
      content: '{ "done": "Fertig" }',
    })
    return { ctx, project }
  }

  it('is not available on the free plan', async () => {
    const { ctx, project } = await setup('free')
    const translator: Translator = async () => ({})
    await expect(
      machineTranslateProject(ctx, translator, { projectId: project.id, locale: 'de' }),
    ).rejects.toThrow(/not available/)
  })

  it('translates untranslated keys, retries rejected output and marks results for review', async () => {
    const { ctx, project } = await setup('agency')
    const calls: string[][] = []
    const translator: Translator = async ({ items }) => {
      calls.push(items.map((i) => i.key))
      const out: Record<string, string> = {}
      for (const item of items) {
        if (item.key === 'greeting') out[item.id] = calls.length === 1 ? 'Hallo {Name}' : 'Hallo {name}'
        if (item.key === 'bye') out[item.id] = '{broken'
      }
      return out
    }
    const result = await machineTranslateProject(ctx, translator, { projectId: project.id, locale: 'de' })
    expect(calls).toEqual([
      ['greeting', 'bye'],
      ['greeting', 'bye'],
    ])
    expect(result).toMatchObject({ requested: 2, translated: 1, failed: [{ key: 'bye' }] })

    const keys = await listKeys(ctx, project.id, { locale: 'de' })
    const greeting = keys.items.find((k) => k.name === 'greeting')!
    expect(greeting).toMatchObject({ value: 'Hallo {name}', status: 'needs_review' })
    expect((await listRevisions(ctx, greeting.id, 'de'))[0]).toMatchObject({ source: 'machine' })
  })
})
