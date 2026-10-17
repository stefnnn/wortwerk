import { afterAll, describe, expect, it } from 'vitest'
import { createMemoryRepo } from '@wortwerk/git'
import {
  getExportState,
  getRepoLink,
  pullFromRepo,
  pushToRepo,
  saveConnection,
  saveRepoLink,
} from '../src/git.ts'
import { createProject, upsertFile } from '../src/projects.ts'
import { listKeys, sourceSyncCounts } from '../src/keys.ts'
import { dismissConflict, listOpenConflicts, listRevisions, setTranslation } from '../src/translations.ts'
import { createTenant, db } from './helpers.ts'

afterAll(() => db.pool.end())

process.env.BETTER_AUTH_SECRET ??= 'test-secret-test-secret'

const json = (values: Record<string, string>) => `${JSON.stringify(values, null, 2)}\n`

async function setup(en: Record<string, string>, de: Record<string, string>) {
  const ctx = await createTenant()
  const project = await createProject(ctx, { name: 'App', slug: 'app', sourceLocale: 'en', locales: ['de'] })
  await upsertFile(ctx, project.id, { path: 'locales/%locale%.json', format: 'json' })
  const connection = await saveConnection(ctx, {
    provider: 'github',
    externalId: crypto.randomUUID(),
    accountName: 'acme',
  })
  await saveRepoLink(ctx, project.id, { connectionId: connection.id, repo: 'acme/app', branch: 'main' })
  const repo = createMemoryRepo({ 'locales/en.json': json(en), 'locales/de.json': json(de) })
  await pullFromRepo(ctx, repo.client, { projectId: project.id })

  const key = async (name: string) => {
    const items = (await listKeys(ctx, project.id, { locale: 'de', search: name })).items
    return items.find((k) => k.name === name)!
  }
  const translate = (name: string, value: string) =>
    key(name).then((k) => setTranslation(ctx, k.id, 'de', { value }))
  const state = async () => getExportState(ctx, (await getRepoLink(ctx, project.id))!)
  const pull = (input: { importTranslations?: boolean } = {}) =>
    pullFromRepo(ctx, repo.client, { projectId: project.id, ...input })
  const push = () => pushToRepo(ctx, repo.client, { projectId: project.id })
  const exported = () => JSON.parse(repo.file('wortwerk/translations', 'locales/de.json') ?? '{}')

  return { ctx, project, repo, key, translate, state, pull, push, exported }
}

describe('translation sync', () => {
  it('takes a translation a developer changed in the repo while wortwerk did not', async () => {
    const s = await setup({ hello: 'Hello' }, { hello: 'Hallo' })
    await s.translate('hello', 'Hallo')
    s.repo.push({ 'locales/de.json': json({ hello: 'Grüezi' }) })
    const result = await s.pull()
    expect(result.files[1]).toMatchObject({ translationsChanged: 1, conflicts: 0 })

    const hello = await s.key('hello')
    expect(hello).toMatchObject({
      value: 'Grüezi',
      repoValue: 'Grüezi',
      status: 'needs_review',
      conflict: false,
    })
    expect((await listRevisions(s.ctx, hello.id, 'de'))[0]).toMatchObject({ value: 'Grüezi', source: 'git' })
    expect(await s.state()).toBe('synced')
  })

  it("keeps wortwerk's translation when both sides changed and restores it on export", async () => {
    const s = await setup({ hello: 'Hello' }, { hello: 'Hallo' })
    await s.translate('hello', 'Hoi')
    s.repo.push({ 'locales/de.json': json({ hello: 'Grüezi' }) })
    expect((await s.pull()).files[1]).toMatchObject({ translationsChanged: 0, conflicts: 1 })

    const hello = await s.key('hello')
    expect(hello).toMatchObject({ value: 'Hoi', repoValue: 'Grüezi', conflict: true })
    expect(await listOpenConflicts(s.ctx, hello.id, 'de')).toEqual([
      expect.objectContaining({ mine: 'Hoi', base: 'Hallo', theirs: 'Grüezi' }),
    ])
    expect(await listOpenConflicts(s.ctx, hello.id, 'en')).toEqual([])
    expect(await sourceSyncCounts(s.ctx, s.project.id)).toMatchObject({ conflicts: 0, targetConflicts: 1 })
    expect((await listKeys(s.ctx, s.project.id, { locale: 'all', sync: 'conflict' })).total).toBe(1)

    await s.push()
    expect(s.exported()).toEqual({ hello: 'Hoi' })

    // adopting the repo's translation closes the conflict
    await s.translate('hello', 'Grüezi')
    expect(await s.key('hello')).toMatchObject({ conflict: false })
    expect(await s.state()).toBe('synced')
  })

  it('closes a translation conflict on dismiss or once the repo agrees', async () => {
    const s = await setup({ hello: 'Hello', bye: 'Bye' }, { hello: 'Hallo', bye: 'Tschüss' })
    await s.translate('hello', 'Hoi')
    await s.translate('bye', 'Ciao')
    s.repo.push({ 'locales/de.json': json({ hello: 'Grüezi', bye: 'Adieu' }) })
    await s.pull()

    await dismissConflict(s.ctx, (await s.key('hello')).id, 'de')
    expect(await s.key('hello')).toMatchObject({ value: 'Hoi', conflict: false })

    await s.push()
    s.repo.push({ 'locales/de.json': s.repo.file('wortwerk/translations', 'locales/de.json')! })
    await s.pull()
    expect(await s.key('bye')).toMatchObject({ value: 'Ciao', repoValue: 'Ciao', conflict: false })
    expect(await s.state()).toBe('synced')
  })

  it('does not take a repo translation that breaks the placeholders', async () => {
    const s = await setup({ hello: 'Hello {name}' }, { hello: 'Hallo {name}' })
    s.repo.push({ 'locales/de.json': json({ hello: 'Hallo {nom}' }) })
    expect((await s.pull()).files[1]).toMatchObject({ translationsChanged: 0, conflicts: 1 })
    expect(await s.key('hello')).toMatchObject({ value: 'Hallo {name}', conflict: true })
  })

  it('fills translations the repo adds for keys wortwerk has not translated', async () => {
    const s = await setup({ hello: 'Hello', bye: 'Bye' }, { hello: 'Hallo' })
    s.repo.push({ 'locales/de.json': json({ hello: 'Hallo', bye: 'Tschüss' }) })
    await s.pull()
    expect(await s.key('bye')).toMatchObject({ value: 'Tschüss', status: 'needs_review' })
  })

  it('keeps a translation cleared in wortwerk and one removed from the repo file', async () => {
    const s = await setup({ hello: 'Hello', bye: 'Bye' }, { hello: 'Hallo', bye: 'Tschüss' })
    await s.translate('hello', '')
    s.repo.push({
      'locales/de.json': json({ hello: 'Hallo' }),
      'locales/en.json': json({ hello: 'Hello', bye: 'Bye' }),
    })
    await s.pull()
    expect(await s.key('hello')).toMatchObject({ value: '', conflict: false })
    expect(await s.key('bye')).toMatchObject({ value: 'Tschüss', repoValue: null, conflict: false })
    await s.push()
    expect(s.exported()).toMatchObject({ bye: 'Tschüss' })
  })

  it('only fills gaps on an explicit import of translations', async () => {
    const s = await setup({ hello: 'Hello' }, { hello: 'Hallo' })
    await s.translate('hello', 'Hoi')
    s.repo.push({ 'locales/de.json': json({ hello: 'Grüezi' }) })
    expect((await s.pull({ importTranslations: true })).files[1]).toMatchObject({ conflicts: 0 })
    expect(await s.key('hello')).toMatchObject({ value: 'Hoi', repoValue: 'Grüezi', conflict: false })
  })
})
