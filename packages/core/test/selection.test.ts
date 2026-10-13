import { afterAll, describe, expect, it } from 'vitest'
import { db, createTenant } from './helpers.ts'
import { createKey, listKeys, resolveKeySelection, setTranslationStatusBulk } from '../src/keys.ts'
import { createProject } from '../src/projects.ts'
import { listRevisions, setTranslation } from '../src/translations.ts'

afterAll(() => db.pool.end())

async function setup() {
  const ctx = await createTenant('agency')
  const project = await createProject(ctx, { name: 'App', slug: 'app', sourceLocale: 'en', locales: ['de'] })
  const keys = []
  for (const name of ['a.one', 'a.two', 'a.three', 'b.one']) {
    keys.push(await createKey(ctx, project.id, { name, sourceValue: `text ${name}` }))
  }
  // a.one and a.two are translated, the other two stay untranslated
  await setTranslation(ctx, keys[0]!.id, 'de', { value: 'eins' })
  await setTranslation(ctx, keys[1]!.id, 'de', { value: 'zwei' })
  return { ctx, project, keys }
}

describe('key selection', () => {
  it('resolves explicit ids, ignoring keys of other projects', async () => {
    const { ctx, project, keys } = await setup()
    const other = await setup()
    const ids = await resolveKeySelection(ctx, project.id, {
      keyIds: [keys[0]!.id, other.keys[0]!.id],
    })
    expect(ids).toEqual([keys[0]!.id])
  })

  it('resolves a filter across all pages and honours exclusions', async () => {
    const { ctx, project, keys } = await setup()
    const filter = { locale: 'de', search: 'a.' }
    const all = await resolveKeySelection(ctx, project.id, { filter })
    expect(all).toHaveLength(3)
    expect((await listKeys(ctx, project.id, { ...filter, limit: 1 })).total).toBe(3)
    const some = await resolveKeySelection(ctx, project.id, { filter, excludeKeyIds: [keys[0]!.id] })
    expect(some).toHaveLength(2)
    expect(some).not.toContain(keys[0]!.id)
    const untranslated = await resolveKeySelection(ctx, project.id, {
      filter: { locale: 'de', status: 'untranslated' },
    })
    expect(untranslated).toHaveLength(2)
  })
})

describe('setTranslationStatusBulk', () => {
  it('updates translated rows, skips untranslated ones and records revisions', async () => {
    const { ctx, project, keys } = await setup()
    const result = await setTranslationStatusBulk(ctx, project.id, 'de', 'approved', {
      filter: { locale: 'de' },
    })
    expect(result).toEqual({ selected: 4, updated: 2 })
    const approved = await listKeys(ctx, project.id, { locale: 'de', status: 'approved' })
    expect(approved.items.map((i) => i.name).sort()).toEqual(['a.one', 'a.two'])
    expect((await listRevisions(ctx, keys[0]!.id, 'de'))[0]).toMatchObject({ status: 'approved' })

    // idempotent
    expect(
      await setTranslationStatusBulk(ctx, project.id, 'de', 'approved', { keyIds: [keys[0]!.id] }),
    ).toEqual({ selected: 1, updated: 0 })
    await expect(
      setTranslationStatusBulk(ctx, project.id, 'fr', 'approved', { keyIds: [keys[0]!.id] }),
    ).rejects.toMatchObject({ code: 'invalid' })
  })
})
