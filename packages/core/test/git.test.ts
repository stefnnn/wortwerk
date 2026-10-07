import { afterAll, describe, expect, it } from 'vitest'
import { createMemoryRepo } from '@wortwerk/git'
import {
  findDueExports,
  getExportState,
  getRepoLink,
  pullFromRepo,
  pushToRepo,
  saveConnection,
  saveRepoLink,
} from '../src/git.ts'
import { addLocale, createProject, upsertFile } from '../src/projects.ts'
import { listKeys } from '../src/keys.ts'
import { setTranslation } from '../src/translations.ts'
import { createProjectToken, resolveProjectToken, revokeProjectToken } from '../src/tokens.ts'
import { openSecret, sealSecret } from '../src/secrets.ts'
import type { Ctx } from '../src/context.ts'
import { createTenant, db } from './helpers.ts'

afterAll(() => db.pool.end())

process.env.BETTER_AUTH_SECRET ??= 'test-secret-test-secret'

const project_pull = (ctx: Ctx, repo: ReturnType<typeof createMemoryRepo>, projectId: string) =>
  pullFromRepo(ctx, repo.client, { projectId })

async function setup() {
  const ctx = await createTenant()
  const project = await createProject(ctx, {
    name: 'App',
    slug: 'app',
    sourceLocale: 'en',
    locales: ['de-CH'],
  })
  await upsertFile(ctx, project.id, { path: 'locales/%locale%.json', format: 'json' })
  const connection = await saveConnection(ctx, {
    provider: 'github',
    externalId: crypto.randomUUID(),
    accountName: 'acme',
  })
  await saveRepoLink(ctx, project.id, {
    connectionId: connection.id,
    repo: 'acme/app',
    branch: 'main',
    localeAliases: { 'de-CH': 'de' },
  })
  return { ctx, project }
}

describe('git sync', () => {
  it('fills translations of new keys from the repo without touching existing ones', async () => {
    const { ctx, project } = await setup()
    const repo = createMemoryRepo({
      'locales/en.json': '{\n  "hello": "Hello"\n}\n',
      'locales/de.json': '{\n  "hello": "Grüezi"\n}\n',
    })
    await pullFromRepo(ctx, repo.client, { projectId: project.id })
    const [hello] = (await listKeys(ctx, project.id, { locale: 'de-CH' })).items
    await setTranslation(ctx, hello!.id, 'de-CH', { value: 'Hoi' })

    repo.push({
      'locales/en.json': '{\n  "hello": "Hello",\n  "save": "Save"\n}\n',
      'locales/de.json': '{\n  "hello": "Hallo",\n  "save": "Speichern"\n}\n',
    })
    await pullFromRepo(ctx, repo.client, { projectId: project.id })
    const items = (await listKeys(ctx, project.id, { locale: 'de-CH' })).items
    expect(items.find((k) => k.name === 'hello')).toMatchObject({ value: 'Hoi' })
    expect(items.find((k) => k.name === 'save')).toMatchObject({ value: 'Speichern', status: 'needs_review' })

    repo.push({ 'locales/en.json': '{\n  "hello": "Hello",\n  "save": "Save!"\n}\n' })
    const unchanged = await pullFromRepo(ctx, repo.client, { projectId: project.id })
    expect(unchanged.files.map((f) => f.locale)).toEqual(['en', 'de-CH'])
    expect(unchanged.files[1]).toMatchObject({ translationsChanged: 0 })
  })

  it('pulls source keys, pushes translations to a PR branch and tracks obsolete keys', async () => {
    const { ctx, project } = await setup()
    const repo = createMemoryRepo({
      'locales/en.json': '{\n  "hello": "Hello",\n  "bye": "Bye"\n}\n',
      'locales/de.json': '{\n  "hello": "Grüezi"\n}\n',
    })

    const first = await pullFromRepo(ctx, repo.client, { projectId: project.id })
    expect(first.files).toEqual([
      expect.objectContaining({ path: 'locales/en.json', keysAdded: 2 }),
      expect.objectContaining({ path: 'locales/de.json', locale: 'de-CH', translationsChanged: 1 }),
    ])
    const imported = (await listKeys(ctx, project.id, { locale: 'de-CH' })).items
    expect(imported.find((k) => k.name === 'hello')).toMatchObject({
      value: 'Grüezi',
      status: 'needs_review',
    })
    expect(await pullFromRepo(ctx, repo.client, { projectId: project.id })).toMatchObject({ skipped: true })

    const onboarding = await pullFromRepo(ctx, repo.client, {
      projectId: project.id,
      importTranslations: true,
    })
    expect(onboarding.files[1]).toMatchObject({
      path: 'locales/de.json',
      locale: 'de-CH',
      translationsUnchanged: 1,
    })

    const keys = await listKeys(ctx, project.id, { locale: 'de-CH' })
    const bye = keys.items.find((k) => k.name === 'bye')!
    await setTranslation(ctx, bye.id, 'de-CH', { value: 'Tschüss' })

    const pushed = await pushToRepo(ctx, repo.client, { projectId: project.id })
    expect(pushed).toMatchObject({ diff: true, updated: true, files: ['locales/de.json'] })
    expect(repo.file('wortwerk/translations', 'locales/de.json')).toBe(
      '{\n  "hello": "Grüezi",\n  "bye": "Tschüss"\n}\n',
    )
    expect(repo.pulls).toHaveLength(1)

    expect(await pushToRepo(ctx, repo.client, { projectId: project.id })).toMatchObject({ updated: false })

    repo.push({ 'locales/en.json': '{\n  "hello": "Hello"\n}\n' })
    const removed = await pullFromRepo(ctx, repo.client, { projectId: project.id })
    expect(removed).toMatchObject({
      changed: true,
      files: expect.arrayContaining([expect.objectContaining({ keysObsoleted: 1 })]),
    })

    expect(await pushToRepo(ctx, repo.client, { projectId: project.id })).toMatchObject({ diff: false })

    const [hello] = (await listKeys(ctx, project.id, { locale: 'de-CH' })).items
    await setTranslation(ctx, hello!.id, 'de-CH', { value: 'Hoi' })
    const again = await pushToRepo(ctx, repo.client, { projectId: project.id })
    expect(again).toMatchObject({ updated: true, pullRequestUrl: repo.pulls[0]!.url })
    expect(repo.file('wortwerk/translations', 'locales/de.json')).toBe('{\n  "hello": "Hoi"\n}\n')
    expect(repo.pulls).toHaveLength(1)
  })

  it('derives the export state from repo values: synced, pending, pr, synced after merge', async () => {
    const { ctx, project } = await setup()
    const repo = createMemoryRepo({
      'locales/en.json': '{\n  "hello": "Hello"\n}\n',
      'locales/de.json': '{\n  "hello": "Grüezi"\n}\n',
    })
    const state = async () => getExportState(ctx, (await getRepoLink(ctx, project.id))!)
    await pullFromRepo(ctx, repo.client, { projectId: project.id })
    expect(await state()).toBe('synced')

    const [hello] = (await listKeys(ctx, project.id, { locale: 'de-CH' })).items
    await setTranslation(ctx, hello!.id, 'de-CH', { value: 'Hoi' })
    expect(await state()).toBe('pending')

    await pushToRepo(ctx, repo.client, { projectId: project.id })
    expect(await state()).toBe('pr')

    // an unrelated commit in the repo does not clear the open pull request
    repo.push({ 'locales/en.json': '{\n  "hello": "Hello",\n  "other": "Other"\n}\n' })
    await pullFromRepo(ctx, repo.client, { projectId: project.id })
    expect(await state()).toBe('pr')

    // merging brings the exported values into the tracked branch
    repo.push({ 'locales/de.json': repo.file('wortwerk/translations', 'locales/de.json')! })
    await pullFromRepo(ctx, repo.client, { projectId: project.id })
    expect(await state()).toBe('synced')
  })

  it('lists only changed files in the PR and refreshes the description on later exports', async () => {
    const { ctx, project } = await setup()
    await addLocale(ctx, project.id, 'fr')
    const repo = createMemoryRepo({
      'locales/en.json': '{\n  "a": "A",\n  "b": "B"\n}\n',
      'locales/de.json': '{\n  "a": "A-de",\n  "b": "B-de"\n}\n',
      'locales/fr.json': '{\n  "a": "A-fr"\n}\n',
    })
    await project_pull(ctx, repo, project.id)
    const keys = (await listKeys(ctx, project.id, { locale: 'fr' })).items
    const b = keys.find((k) => k.name === 'b')!
    await setTranslation(ctx, b.id, 'fr', { value: 'B-fr' })
    await pushToRepo(ctx, repo.client, { projectId: project.id })
    expect(repo.pulls[0]!.body).toContain('`locales/fr.json` (fr, 1 strings changed)')
    expect(repo.pulls[0]!.body).not.toContain('locales/de.json')

    const a = keys.find((k) => k.name === 'a')!
    await setTranslation(ctx, a.id, 'fr', { value: 'A-fr!' })
    await pushToRepo(ctx, repo.client, { projectId: project.id })
    expect(repo.pulls).toHaveLength(1)
    expect(repo.pulls[0]!.body).toContain('`locales/fr.json` (fr, 2 strings changed)')
  })

  it('finds projects with unexported edits after the quiet period', async () => {
    const { ctx, project } = await setup()
    const repo = createMemoryRepo({ 'locales/en.json': '{ "a": "A" }' })
    await pullFromRepo(ctx, repo.client, { projectId: project.id })
    const [key] = (await listKeys(ctx, project.id, { locale: 'de-CH' })).items
    await setTranslation(ctx, key!.id, 'de-CH', { value: 'A!' })

    const mine = (rows: Array<{ projectId: string }>) => rows.filter((r) => r.projectId === project.id)
    expect(mine(await findDueExports(db, 60))).toHaveLength(0)
    expect(mine(await findDueExports(db, 0))).toHaveLength(1)
    await pushToRepo(ctx, repo.client, { projectId: project.id })
    expect(mine(await findDueExports(db, 0))).toHaveLength(0)
  })

  it('refuses identical tracked and export branches', async () => {
    const { ctx, project } = await setup()
    const link = await saveRepoLink(ctx, project.id, {
      connectionId: (await saveConnection(ctx, { provider: 'github', externalId: 'x', accountName: 'x' })).id,
      repo: 'acme/app',
      branch: 'main',
    })
    expect(link.link.exportBranch).toBe('wortwerk/translations')
    await expect(
      saveRepoLink(ctx, project.id, {
        connectionId: link.link.connectionId,
        repo: 'acme/app',
        branch: 'x',
        exportBranch: 'x',
      }),
    ).rejects.toThrow(/must differ/)
  })
})

describe('project tokens and secrets', () => {
  it('resolves tokens by hash and forgets revoked ones', async () => {
    const { ctx, project } = await setup()
    const created = await createProjectToken(ctx, project.id, { name: 'CI' })
    expect(created.token).toMatch(/^ww_/)
    expect(await resolveProjectToken(db, created.token)).toEqual({
      tenantId: ctx.tenantId,
      projectId: project.id,
    })
    expect(await resolveProjectToken(db, 'ww_nope')).toBeNull()
    await revokeProjectToken(ctx, project.id, created.id)
    expect(await resolveProjectToken(db, created.token)).toBeNull()
  })

  it('round-trips sealed secrets', () => {
    const sealed = sealSecret({ accessToken: 'a', n: 1 })
    expect(sealed).not.toContain('accessToken')
    expect(openSecret(sealed)).toEqual({ accessToken: 'a', n: 1 })
  })
})
