import { afterAll, describe, expect, it } from 'vitest'
import { createMemoryRepo } from '@wortwerk/git'
import {
  assertLinkAccess,
  backfillAccountType,
  assertRepoAccess,
  checkRepoAccess,
  claimRepoAccessAlert,
  getRepoLink,
  listRepoLinksForAccessCheck,
  releaseRepoAccessAlert,
  repoAccessFixUrl,
  saveConnection,
  saveRepoLink,
  type GitProviders,
} from '../src/git.ts'
import { createProject } from '../src/projects.ts'
import { createTenant, db } from './helpers.ts'

afterAll(() => db.pool.end())

async function setup() {
  const ctx = await createTenant()
  const project = await createProject(ctx, {
    name: 'App',
    slug: 'app',
    sourceLocale: 'en',
    locales: ['de-CH'],
  })
  const connection = await saveConnection(ctx, {
    provider: 'github',
    externalId: crypto.randomUUID(),
    accountName: 'acme',
    accountType: 'Organization',
  })
  await saveRepoLink(ctx, project.id, { connectionId: connection.id, repo: 'acme/app', branch: 'main' })
  const memory = createMemoryRepo({ 'locales/en.json': '{}' })
  const providers = { github: { client: () => memory.client } } as unknown as GitProviders
  const link = (await getRepoLink(ctx, project.id))!
  return { ctx, project, providers, memory, link }
}

describe('repo access', () => {
  it('records a lost access once and clears it when restored', async () => {
    const { ctx, project, providers, memory, link } = await setup()
    memory.setAccess(false)
    expect(await checkRepoAccess(ctx, providers, link)).toBe(false)
    const lost = await getRepoLink(ctx, project.id)
    expect(lost?.accessLostAt).toBeInstanceOf(Date)
    expect(lost?.accessError).toContain('acme/app')

    await checkRepoAccess(ctx, providers, link)
    expect((await getRepoLink(ctx, project.id))?.accessLostAt).toEqual(lost?.accessLostAt)

    memory.setAccess(true)
    expect(await checkRepoAccess(ctx, providers, link)).toBe(true)
    const restored = await getRepoLink(ctx, project.id)
    expect(restored?.accessLostAt).toBeNull()
    expect(restored?.accessError).toBeNull()
    expect(restored?.accessCheckedAt).toBeInstanceOf(Date)
  })

  it('claims the alert once per lost-access event', async () => {
    const { ctx, project, providers, memory, link } = await setup()
    expect(await claimRepoAccessAlert(db, ctx.tenantId, project.id)).toBe(false)

    memory.setAccess(false)
    await checkRepoAccess(ctx, providers, link)
    expect(await claimRepoAccessAlert(db, ctx.tenantId, project.id)).toBe(true)
    expect(await claimRepoAccessAlert(db, ctx.tenantId, project.id)).toBe(false)
    await checkRepoAccess(ctx, providers, link)
    expect(await claimRepoAccessAlert(db, ctx.tenantId, project.id)).toBe(false)

    memory.setAccess(true)
    await checkRepoAccess(ctx, providers, link)
    memory.setAccess(false)
    await checkRepoAccess(ctx, providers, link)
    expect(await claimRepoAccessAlert(db, ctx.tenantId, project.id)).toBe(true)
  })

  it('allows a retry after the alert was released', async () => {
    const { ctx, project, providers, memory, link } = await setup()
    memory.setAccess(false)
    await checkRepoAccess(ctx, providers, link)
    expect(await claimRepoAccessAlert(db, ctx.tenantId, project.id)).toBe(true)
    await releaseRepoAccessAlert(db, ctx.tenantId, project.id)
    expect(await claimRepoAccessAlert(db, ctx.tenantId, project.id)).toBe(true)
  })

  it('refuses to link a repository the connection cannot access', async () => {
    const { ctx, providers, memory, link } = await setup()
    memory.setAccess(false)
    await expect(assertRepoAccess(ctx, providers, link.connectionId, 'acme/app')).rejects.toThrow(
      'cannot access acme/app',
    )
    memory.setAccess(true)
    await expect(assertRepoAccess(ctx, providers, link.connectionId, 'acme/app')).resolves.toBeUndefined()
  })

  it('fails a sync up front with the access message when the repository is gone', async () => {
    const { ctx, providers, memory, link } = await setup()
    memory.setAccess(false)
    await expect(assertLinkAccess(ctx, providers, link)).rejects.toThrow('cannot access acme/app')
    memory.setAccess(true)
    await expect(assertLinkAccess(ctx, providers, link)).resolves.toBeUndefined()
  })

  it('fills in a missing account type from GitHub', async () => {
    const { ctx, memory } = await setup()
    const connection = await saveConnection(ctx, {
      provider: 'github',
      externalId: '777',
      accountName: 'getrestful',
    })
    const providers = {
      github: {
        client: () => memory.client,
        getInstallation: async () => ({ id: '777', account: 'getrestful', accountType: 'Organization' }),
      },
    } as unknown as GitProviders
    await backfillAccountType(ctx, providers, {
      ...connection,
      provider: 'github',
      externalId: '777',
      accountType: null,
    })
    const row = await ctx.db.query.gitConnection.findFirst({ where: (c, { eq }) => eq(c.id, connection.id) })
    expect(row?.accountType).toBe('Organization')
  })

  it('lists linked repositories with their fix link', async () => {
    const { ctx, project } = await setup()
    const row = (await listRepoLinksForAccessCheck(db)).find((r) => r.projectId === project.id)
    expect(row).toBeDefined()
    expect(row?.tenantId).toBe(ctx.tenantId)
    expect(repoAccessFixUrl(row!)).toBe(
      `https://github.com/organizations/acme/settings/installations/${row!.externalId}`,
    )
  })
})

describe('repoAccessFixUrl', () => {
  const connection = { provider: 'github' as const, externalId: '42', accountName: 'jo', accountType: 'User' }

  it('links to the installation settings of the account type', () => {
    expect(repoAccessFixUrl(connection)).toBe('https://github.com/settings/installations/42')
    expect(repoAccessFixUrl({ ...connection, accountType: 'Organization' })).toBe(
      'https://github.com/organizations/jo/settings/installations/42',
    )
  })

  it('falls back to the installations list for connections saved before the account type was known', () => {
    expect(repoAccessFixUrl({ ...connection, accountType: null })).toBe(
      'https://github.com/settings/installations',
    )
  })

  it('has no GitHub link for Bitbucket', () => {
    expect(repoAccessFixUrl({ ...connection, provider: 'bitbucket' })).toBeNull()
  })
})
