import { afterAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { schema } from '@wortwerk/db'
import { db, createTenant } from './helpers.ts'
import {
  createApiToken,
  decideDeviceAuth,
  getDeviceAuth,
  listApiTokens,
  normalizeUserCode,
  pollDeviceAuth,
  resolveApiToken,
  revokeApiToken,
  startDeviceAuth,
} from '../src/api-tokens.ts'
import {
  claimCliSetup,
  completeCliSetup,
  denyCliSetup,
  getCliSetup,
  pollCliSetup,
  startCliSetup,
} from '../src/cli-setup.ts'
import { createProject } from '../src/projects.ts'

afterAll(() => db.pool.end())

async function member() {
  const ctx = await createTenant()
  await db.insert(schema.member).values({
    id: crypto.randomUUID(),
    organizationId: ctx.tenantId,
    userId: ctx.userId!,
    role: 'owner',
    createdAt: new Date(),
  })
  return { tenantId: ctx.tenantId, userId: ctx.userId! }
}

describe('personal access tokens', () => {
  it('resolves, lists and revokes tokens', async () => {
    const { tenantId, userId } = await member()
    const { token, id } = await createApiToken(db, userId, { name: 'laptop', access: 'read', tenantId })
    expect(token).toMatch(/^wwu_/)
    expect(await resolveApiToken(db, token)).toMatchObject({ id, userId, tenantId, access: 'read' })
    expect(await resolveApiToken(db, `${token}x`)).toBeNull()

    const [listed] = await listApiTokens(db, userId)
    expect(listed).toMatchObject({ name: 'laptop', workspace: { id: tenantId } })
    expect(listed!.lastUsedAt).not.toBeNull()
    expect(JSON.stringify(listed)).not.toContain(token)

    await revokeApiToken(db, userId, id)
    expect(await resolveApiToken(db, token)).toBeNull()
  })

  it('rejects expired tokens and workspaces the user is not in', async () => {
    const { userId } = await member()
    const other = await member()
    await expect(createApiToken(db, userId, { name: 'x', tenantId: other.tenantId })).rejects.toMatchObject({
      code: 'not_found',
    })
    const { token, id } = await createApiToken(db, userId, { name: 'old' })
    await db
      .update(schema.apiToken)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(schema.apiToken.id, id))
    expect(await resolveApiToken(db, token)).toBeNull()
  })

  it('cannot revoke another user’s token', async () => {
    const a = await member()
    const b = await member()
    const { id } = await createApiToken(db, a.userId, { name: 'a' })
    await expect(revokeApiToken(db, b.userId, id)).rejects.toMatchObject({ code: 'not_found' })
  })
})

describe('device login', () => {
  it('hands out a token exactly once after approval', async () => {
    const { userId } = await member()
    const started = await startDeviceAuth(db, { clientName: 'wortwerk CLI on box' })
    expect(started.userCode).toMatch(/^[A-Z]{4}-[A-Z]{4}$/)
    expect(await pollDeviceAuth(db, started.deviceCode)).toEqual({ status: 'authorization_pending' })
    expect(await pollDeviceAuth(db, started.deviceCode)).toEqual({ status: 'slow_down' })

    const lower = started.userCode.toLowerCase().replace('-', ' ')
    expect(await getDeviceAuth(db, lower)).toMatchObject({ clientName: 'wortwerk CLI on box' })
    await decideDeviceAuth(db, userId, lower, true)

    const result = await pollDeviceAuth(db, started.deviceCode)
    expect(result).toMatchObject({ status: 'approved', userId })
    if (result.status !== 'approved') throw new Error('not approved')
    expect(await resolveApiToken(db, result.token)).toMatchObject({ userId, tenantId: null, access: 'write' })
    expect(await pollDeviceAuth(db, started.deviceCode)).toEqual({ status: 'expired_token' })
    await expect(getDeviceAuth(db, started.userCode)).rejects.toMatchObject({ code: 'not_found' })
  })

  it('reports denied and expired requests', async () => {
    const { userId } = await member()
    const denied = await startDeviceAuth(db, { clientName: 'cli' })
    await decideDeviceAuth(db, userId, denied.userCode, false)
    expect(await pollDeviceAuth(db, denied.deviceCode)).toEqual({ status: 'access_denied' })

    const expired = await startDeviceAuth(db, { clientName: 'cli' })
    await db
      .update(schema.deviceAuth)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(schema.deviceAuth.userCode, expired.userCode))
    expect(await pollDeviceAuth(db, expired.deviceCode)).toEqual({ status: 'expired_token' })
    await expect(decideDeviceAuth(db, userId, expired.userCode, true)).rejects.toMatchObject({
      code: 'not_found',
    })
    expect(await pollDeviceAuth(db, 'nonsense')).toEqual({ status: 'expired_token' })
  })

  it('normalizes typed user codes', () => {
    expect(normalizeUserCode('bcdf-ghjk')).toBe('BCDF-GHJK')
    expect(normalizeUserCode(' BCDF GHJK ')).toBe('BCDF-GHJK')
    expect(normalizeUserCode('BCD')).toBeNull()
  })
})

describe('CLI project setup', () => {
  const proposal = {
    name: 'Shop',
    git: { provider: 'github' as const, repo: 'acme/shop', remote: 'origin', branch: 'main' },
    patterns: [
      {
        path: 'locales/%locale%.json',
        format: 'json' as const,
        locales: ['en', 'de'],
        confidence: 1,
      },
    ],
    sourceLocale: 'en',
    locales: ['en', 'de'],
    localeAliases: {},
  }

  it('binds the browser account and hands out the completed project exactly once', async () => {
    const owner = await member()
    const other = await member()
    const existingToken = (await createApiToken(db, owner.userId, { name: 'existing' })).token
    const started = await startCliSetup(db, { clientName: 'wortwerk CLI on test', proposal }, existingToken)
    expect(await pollCliSetup(db, started.deviceCode)).toEqual({ status: 'authorization_pending' })
    await expect(claimCliSetup(db, other.userId, started.userCode)).rejects.toMatchObject({
      code: 'forbidden',
    })
    const claimed = await claimCliSetup(db, owner.userId, started.userCode)
    expect(claimed).toMatchObject({ status: 'claimed', proposal: { name: 'Shop' } })
    const project = await createProject(
      { db, tenantId: owner.tenantId, userId: owner.userId },
      { name: 'Shop', slug: 'shop', sourceLocale: 'en', locales: ['de'] },
    )
    await completeCliSetup(db, owner.userId, started.userCode, {
      tenantId: owner.tenantId,
      projectId: project.id,
    })
    expect(await getCliSetup(db, owner.userId, started.userCode)).toMatchObject({ status: 'completed' })
    const result = await pollCliSetup(db, started.deviceCode)
    expect(result).toMatchObject({
      status: 'completed',
      userId: owner.userId,
      tenantId: owner.tenantId,
      projectId: project.id,
    })
    expect(await pollCliSetup(db, started.deviceCode)).toEqual({ status: 'expired_token' })
  })

  it('reports a denied setup to the CLI', async () => {
    const owner = await member()
    const started = await startCliSetup(db, { clientName: 'cli', proposal })
    await denyCliSetup(db, owner.userId, started.userCode)
    expect(await pollCliSetup(db, started.deviceCode)).toEqual({ status: 'access_denied' })
  })
})
