import { and, asc, desc, eq, gt, isNull, or } from 'drizzle-orm'
import { schema, type DbOrTx } from '@wortwerk/db'
import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import { DomainError, notFound } from './context.ts'
import { randomToken, sha256 } from './secrets.ts'

const { apiToken, deviceAuth, member, tenant } = schema

export const apiTokenPrefix = 'wwu_'
export const apiTokenAccess = ['read', 'write'] as const
export type ApiTokenAccess = (typeof apiTokenAccess)[number]

export const apiTokenInput = z.object({
  name: z.string().trim().min(1).max(80),
  access: z.enum(apiTokenAccess).default('write'),
  // null = every workspace of the user
  tenantId: z.string().nullable().default(null),
  expiresInDays: z.number().int().min(1).max(3650).nullable().default(90),
})

export async function listMemberships(db: DbOrTx, userId: string) {
  return db
    .select({ id: tenant.id, name: tenant.name, slug: tenant.slug, plan: tenant.plan, role: member.role })
    .from(member)
    .innerJoin(tenant, eq(tenant.id, member.organizationId))
    .where(eq(member.userId, userId))
    .orderBy(asc(tenant.name))
}

/** The user's membership in a workspace addressed by slug or id. */
export async function findMembership(db: DbOrTx, userId: string, slugOrId: string) {
  const [row] = await db
    .select({ tenant, role: member.role })
    .from(member)
    .innerJoin(tenant, eq(tenant.id, member.organizationId))
    .where(and(eq(member.userId, userId), or(eq(tenant.slug, slugOrId), eq(tenant.id, slugOrId))))
  return row ?? null
}

export async function listApiTokens(db: DbOrTx, userId: string) {
  return db
    .select({
      id: apiToken.id,
      name: apiToken.name,
      access: apiToken.access,
      tokenPrefix: apiToken.tokenPrefix,
      workspace: { id: tenant.id, name: tenant.name, slug: tenant.slug },
      expiresAt: apiToken.expiresAt,
      lastUsedAt: apiToken.lastUsedAt,
      createdAt: apiToken.createdAt,
    })
    .from(apiToken)
    .leftJoin(tenant, eq(tenant.id, apiToken.tenantId))
    .where(eq(apiToken.userId, userId))
    .orderBy(desc(apiToken.createdAt))
}

export async function createApiToken(db: DbOrTx, userId: string, input: z.input<typeof apiTokenInput>) {
  const data = apiTokenInput.parse(input)
  if (data.tenantId && !(await findMembership(db, userId, data.tenantId))) notFound('Workspace')
  const token = `${apiTokenPrefix}${randomToken()}`
  const [row] = await db
    .insert(apiToken)
    .values({
      userId,
      tenantId: data.tenantId,
      name: data.name,
      access: data.access,
      tokenHash: sha256(token),
      tokenPrefix: token.slice(0, 12),
      expiresAt: data.expiresInDays ? new Date(Date.now() + data.expiresInDays * 86_400_000) : null,
    })
    .returning({ id: apiToken.id, name: apiToken.name, expiresAt: apiToken.expiresAt })
  return { ...row!, token }
}

export async function revokeApiToken(db: DbOrTx, userId: string, tokenId: string) {
  const [row] = await db
    .delete(apiToken)
    .where(and(eq(apiToken.userId, userId), eq(apiToken.id, tokenId)))
    .returning({ id: apiToken.id })
  if (!row) notFound('Token')
}

/** Resolves a personal bearer token; memberships are checked per request by the caller. */
export async function resolveApiToken(db: DbOrTx, token: string) {
  if (!token.startsWith(apiTokenPrefix)) return null
  const [row] = await db
    .update(apiToken)
    .set({ lastUsedAt: new Date() })
    .where(
      and(
        eq(apiToken.tokenHash, sha256(token)),
        or(isNull(apiToken.expiresAt), gt(apiToken.expiresAt, new Date())),
      ),
    )
    .returning({
      id: apiToken.id,
      userId: apiToken.userId,
      tenantId: apiToken.tenantId,
      access: apiToken.access,
    })
  return row ?? null
}

// RFC 8628 suggests consonants only: no vowels means no accidental words, no 0/O or 1/I mixups
const userCodeAlphabet = 'BCDFGHJKLMNPQRSTVWXZ'
export const deviceAuthTtlSeconds = 10 * 60
export const deviceAuthInterval = 5

function newUserCode() {
  const chars = [...randomBytes(8)].map((b) => userCodeAlphabet[b % userCodeAlphabet.length])
  return `${chars.slice(0, 4).join('')}-${chars.slice(4).join('')}`
}

export function normalizeUserCode(input: string) {
  const letters = input.toUpperCase().replace(/[^A-Z]/g, '')
  return letters.length === 8 ? `${letters.slice(0, 4)}-${letters.slice(4)}` : null
}

export const deviceAuthInput = z.object({ clientName: z.string().trim().min(1).max(80) })

export async function startDeviceAuth(db: DbOrTx, input: z.input<typeof deviceAuthInput>) {
  const { clientName } = deviceAuthInput.parse(input)
  const deviceCode = randomToken()
  const userCode = newUserCode()
  await db.insert(deviceAuth).values({
    deviceCodeHash: sha256(deviceCode),
    userCode,
    clientName,
    expiresAt: new Date(Date.now() + deviceAuthTtlSeconds * 1000),
  })
  return { deviceCode, userCode, expiresIn: deviceAuthTtlSeconds, interval: deviceAuthInterval }
}

async function pendingRequest(db: DbOrTx, userCode: string) {
  const code = normalizeUserCode(userCode)
  const row = code ? await db.query.deviceAuth.findFirst({ where: eq(deviceAuth.userCode, code) }) : undefined
  if (!row || row.status !== 'pending' || row.expiresAt < new Date())
    throw new DomainError('not_found', 'This code is invalid or has expired')
  return row
}

/** What the approval page shows before the user confirms. */
export async function getDeviceAuth(db: DbOrTx, userCode: string) {
  const row = await pendingRequest(db, userCode)
  return { userCode: row.userCode, clientName: row.clientName, expiresAt: row.expiresAt }
}

export async function decideDeviceAuth(db: DbOrTx, userId: string, userCode: string, approve: boolean) {
  const row = await pendingRequest(db, userCode)
  await db
    .update(deviceAuth)
    .set({ status: approve ? 'approved' : 'denied', userId })
    .where(and(eq(deviceAuth.id, row.id), eq(deviceAuth.status, 'pending')))
}

export type DevicePoll =
  | { status: 'authorization_pending' | 'slow_down' | 'expired_token' | 'access_denied' }
  | { status: 'approved'; token: string; userId: string }

/** Polled by the CLI: hands out a personal token exactly once after approval. */
export async function pollDeviceAuth(db: DbOrTx, deviceCode: string): Promise<DevicePoll> {
  const row = await db.query.deviceAuth.findFirst({
    where: eq(deviceAuth.deviceCodeHash, sha256(deviceCode)),
  })
  if (!row || row.status === 'consumed' || row.expiresAt < new Date()) return { status: 'expired_token' }
  if (row.status === 'denied') return { status: 'access_denied' }
  if (row.status === 'pending') {
    const now = new Date()
    const tooSoon =
      row.lastPolledAt && now.getTime() - row.lastPolledAt.getTime() < (deviceAuthInterval - 1) * 1000
    await db.update(deviceAuth).set({ lastPolledAt: now }).where(eq(deviceAuth.id, row.id))
    return { status: tooSoon ? 'slow_down' : 'authorization_pending' }
  }
  return db.transaction(async (tx) => {
    const [claimed] = await tx
      .update(deviceAuth)
      .set({ status: 'consumed' })
      .where(and(eq(deviceAuth.id, row.id), eq(deviceAuth.status, 'approved')))
      .returning({ userId: deviceAuth.userId })
    if (!claimed?.userId) return { status: 'expired_token' as const }
    const { token } = await createApiToken(tx, claimed.userId, {
      name: row.clientName,
      access: 'write',
      tenantId: null,
      expiresInDays: 365,
    })
    return { status: 'approved' as const, token, userId: claimed.userId }
  })
}
