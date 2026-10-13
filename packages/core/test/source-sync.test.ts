import { afterAll, describe, expect, it } from 'vitest'
import { createMemoryRepo } from '@wortwerk/git'
import { pullFromRepo, pushToRepo, saveConnection, saveRepoLink } from '../src/git.ts'
import { createProject, upsertFile } from '../src/projects.ts'
import { createKey, listKeys, sourceSyncCounts } from '../src/keys.ts'
import { keepRepoVersion, listOpenConflicts, setTranslation } from '../src/translations.ts'
import { createTenant, db } from './helpers.ts'

afterAll(() => db.pool.end())

process.env.BETTER_AUTH_SECRET ??= 'test-secret-test-secret'

const en = (values: Record<string, string>) => `${JSON.stringify(values, null, 2)}\n`

async function setup(source: Record<string, string>) {
  const ctx = await createTenant()
  const project = await createProject(ctx, { name: 'App', slug: 'app', sourceLocale: 'en', locales: ['de'] })
  await upsertFile(ctx, project.id, { path: 'locales/%locale%.json', format: 'json' })
  const connection = await saveConnection(ctx, {
    provider: 'github',
    externalId: crypto.randomUUID(),
    accountName: 'acme',
  })
  await saveRepoLink(ctx, project.id, { connectionId: connection.id, repo: 'acme/app', branch: 'main' })
  const repo = createMemoryRepo({ 'locales/en.json': en(source) })
  await pullFromRepo(ctx, repo.client, { projectId: project.id })

  const key = async (name: string) => {
    const items = (await listKeys(ctx, project.id, { locale: 'de', search: name })).items
    return items.find((k) => k.name === name)!
  }
  const sourceRow = async (name: string) => {
    const items = (await listKeys(ctx, project.id, { locale: 'en', search: name, obsolete: undefined })).items
    return items.find((k) => k.name === name)
  }
  // edit wording in wortwerk, translate into German
  const edit = (name: string, value: string, minor?: boolean) =>
    key(name).then((k) => setTranslation(ctx, k.id, 'en', { value, minor }))
  const translate = (name: string, value: string) =>
    key(name).then((k) => setTranslation(ctx, k.id, 'de', { value }))
  const pull = () => pullFromRepo(ctx, repo.client, { projectId: project.id })
  const push = () => pushToRepo(ctx, repo.client, { projectId: project.id })
  const merge = () => repo.push({ 'locales/en.json': repo.file('wortwerk/translations', 'locales/en.json')! })

  return { ctx, project, repo, key, source: sourceRow, edit, translate, pull, push, merge }
}

describe('source text sync', () => {
  it('keeps wortwerk wording through unrelated pulls, pushes it and settles after the merge', async () => {
    const s = await setup({ title: 'Welcome', save: 'Save' })
    await s.translate('title', 'Willkommen')
    await s.edit('title', 'Welcome back')
    expect(await s.key('title')).toMatchObject({ status: 'needs_review' })
    expect(await sourceSyncCounts(s.ctx, s.project.id)).toEqual({ pending: 1, conflicts: 0 })

    // a developer changes another key
    s.repo.push({ 'locales/en.json': en({ title: 'Welcome', save: 'Save changes' }) })
    await s.pull()
    expect(await s.source('title')).toMatchObject({ source: 'Welcome back', repoValue: 'Welcome' })
    expect(await s.source('save')).toMatchObject({ source: 'Save changes', repoValue: 'Save changes' })

    const pushed = await s.push()
    expect(pushed).toMatchObject({ sourceChanges: 1, diff: true })
    expect(s.repo.file('wortwerk/translations', 'locales/en.json')).toBe(
      en({ title: 'Welcome back', save: 'Save changes' }),
    )
    expect(s.repo.pulls).toHaveLength(1)

    // after the merge nothing is pending and the reviewed translation is not flagged again
    await s.translate('title', 'Willkommen zurück')
    s.merge()
    await s.pull()
    expect(await sourceSyncCounts(s.ctx, s.project.id)).toEqual({ pending: 0, conflicts: 0 })
    expect(await s.key('title')).toMatchObject({ value: 'Willkommen zurück', status: 'translated' })
  })

  it('takes developer changes to untouched keys and flags their translations', async () => {
    const s = await setup({ hello: 'Hello' })
    await s.translate('hello', 'Hallo')
    s.repo.push({ 'locales/en.json': en({ hello: 'Hello {name}' }) })
    const result = await s.pull()
    expect(result.files[0]).toMatchObject({ translationsChanged: 1, conflicts: 0 })
    expect(await s.source('hello')).toMatchObject({ source: 'Hello {name}', repoValue: 'Hello {name}' })
    expect(await s.key('hello')).toMatchObject({ status: 'needs_review' })
  })

  it('lets the repo win a conflict and keeps the wortwerk wording', async () => {
    const s = await setup({ hello: 'Hello' })
    await s.edit('hello', 'Hi there')
    s.repo.push({ 'locales/en.json': en({ hello: 'Hello {name}' }) })
    const result = await s.pull()
    expect(result.files[0]).toMatchObject({ conflicts: 1 })

    const hello = await s.source('hello')
    expect(hello).toMatchObject({ source: 'Hello {name}', repoValue: 'Hello {name}', conflict: true })
    expect(await listOpenConflicts(s.ctx, hello!.id)).toEqual([
      expect.objectContaining({ mine: 'Hi there', base: 'Hello', theirs: 'Hello {name}' }),
    ])
    expect(await sourceSyncCounts(s.ctx, s.project.id)).toEqual({ pending: 0, conflicts: 1 })
    expect((await listKeys(s.ctx, s.project.id, { locale: 'en', sync: 'conflict' })).total).toBe(1)

    // re-applying the wording must keep the developer's placeholder, and closes the conflict
    await expect(s.edit('hello', 'Hi there')).rejects.toThrow(/placeholders changed/)
    await s.edit('hello', 'Hi there {name}')
    expect(await listOpenConflicts(s.ctx, hello!.id)).toEqual([])
    expect(await sourceSyncCounts(s.ctx, s.project.id)).toEqual({ pending: 1, conflicts: 0 })
  })

  it('closes an open conflict when the repo changes the key again', async () => {
    const s = await setup({ hello: 'Hello' })
    await s.edit('hello', 'Hi there')
    s.repo.push({ 'locales/en.json': en({ hello: 'Hello {name}' }) })
    await s.pull()
    s.repo.push({ 'locales/en.json': en({ hello: 'Hello again {name}' }) })
    await s.pull()
    const hello = await s.source('hello')
    expect(hello).toMatchObject({ source: 'Hello again {name}', conflict: false })
    expect(await sourceSyncCounts(s.ctx, s.project.id)).toEqual({ pending: 0, conflicts: 0 })
  })

  it('records a conflict when the repo removes a key with unpushed wording', async () => {
    const s = await setup({ intro: 'Read the terms and accept them', other: 'Other' })
    await s.edit('intro', 'Please read and accept the terms')
    // the developer splits the key in two
    s.repo.push({
      'locales/en.json': en({ intro_read: 'Read the terms', intro_accept: 'Accept them', other: 'Other' }),
    })
    const result = await s.pull()
    expect(result.files[0]).toMatchObject({ keysObsoleted: 1, keysAdded: 2, conflicts: 1 })

    const conflicts = await listKeys(s.ctx, s.project.id, { locale: 'en', sync: 'conflict' })
    expect(conflicts.items).toEqual([expect.objectContaining({ name: 'intro', conflict: true })])
    expect(conflicts.items[0]!.obsoleteAt).not.toBeNull()
    expect(await listOpenConflicts(s.ctx, conflicts.items[0]!.id)).toEqual([
      expect.objectContaining({ mine: 'Please read and accept the terms', theirs: null }),
    ])
    await keepRepoVersion(s.ctx, conflicts.items[0]!.id)
    expect(await sourceSyncCounts(s.ctx, s.project.id)).toEqual({ pending: 0, conflicts: 0 })
    // obsolete keys are never pushed
    expect(await s.push()).toMatchObject({ sourceChanges: 0, diff: false })
  })

  it('does not report a conflict when both sides made the same change', async () => {
    const s = await setup({ hello: 'Hello' })
    await s.edit('hello', 'Hello!')
    s.repo.push({ 'locales/en.json': en({ hello: 'Hello!' }) })
    expect((await s.pull()).files[0]).toMatchObject({ conflicts: 0, translationsChanged: 0 })
    expect(await sourceSyncCounts(s.ctx, s.project.id)).toEqual({ pending: 0, conflicts: 0 })
  })

  it('pulls before pushing so a stale base never reverts developer changes', async () => {
    const s = await setup({ a: 'A', b: 'B' })
    await s.edit('a', 'A!')
    // the developer commits, and no webhook arrives before the push
    s.repo.push({ 'locales/en.json': en({ a: 'A', b: 'B {count}', c: 'C' }) })
    const pushed = await s.push()
    expect(pushed.pulled).not.toBeNull()
    expect(s.repo.file('wortwerk/translations', 'locales/en.json')).toBe(
      en({ a: 'A!', b: 'B {count}', c: 'C' }),
    )
  })

  it('locks the structure of repo text but leaves wording free', async () => {
    const s = await setup({
      items: '{count, plural, one {# item} other {# items}}',
      link: 'See <b>terms</b>',
    })
    await s.translate('link', 'Siehe <b>AGB</b>')
    await expect(s.edit('items', 'Some items')).rejects.toThrow(/plural/)
    await expect(s.edit('link', 'See terms')).rejects.toThrow(/markup/)
    await expect(s.edit('link', '')).rejects.toThrow(/cannot be emptied/)
    await s.edit('items', '{count, plural, one {# entry} other {# entries}}')
    // a minor edit does not send translations back to review
    await s.edit('link', 'See our <b>terms</b>', true)
    expect(await s.key('link')).toMatchObject({ status: 'translated' })
  })

  it('only lets developers add keys to a connected project', async () => {
    const s = await setup({ a: 'A' })
    await expect(createKey(s.ctx, s.project.id, { name: 'new' })).rejects.toThrow(/added in the repository/)
  })
})
