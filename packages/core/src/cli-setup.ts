import { randomBytes } from 'node:crypto'
import { and, eq, lt } from 'drizzle-orm'
import { z } from 'zod'
import { schema, type DbOrTx } from '@wortwerk/db'
import { createApiToken, resolveApiToken } from './api-tokens.ts'
import { DomainError } from './context.ts'
import { localeCode } from './projects.ts'
import { randomToken, sha256 } from './secrets.ts'

const { cliSetup } = schema
const codeAlphabet = 'BCDFGHJKLMNPQRSTVWXZ'
export const cliSetupTtlSeconds = 60 * 60
export const cliSetupInterval = 5

const pattern = z.object({
  path: z
    .string()
    .trim()
    .min(1)
    .max(300)
    .refine((path) => path.includes('%locale%')),
  format: z.enum(['json', 'yaml', 'po', 'script']),
  locales: z.array(localeCode).max(50),
  confidence: z.number().min(0).max(1),
  keyCounts: z.record(z.string(), z.number().int().nonnegative()).optional(),
})

export const cliSetupProposal = z.object({
  name: z.string().trim().min(1).max(120),
  git: z
    .object({
      provider: z.enum(['github', 'bitbucket']),
      repo: z.string().regex(/^[\w.-]+\/[\w.-]+$/),
      remote: z.string().max(80),
      branch: z.string().max(200).optional(),
    })
    .optional(),
  patterns: z.array(pattern).max(20),
  sourceLocale: localeCode.optional(),
  locales: z.array(localeCode).max(50),
  localeAliases: z.record(localeCode, z.string().trim().min(1).max(40)).default({}),
})

export const startCliSetupInput = z.object({
  clientName: z.string().trim().min(1).max(80),
  proposal: cliSetupProposal,
})

function userCode() {
  const chars = [...randomBytes(8)].map((byte) => codeAlphabet[byte % codeAlphabet.length])
  return `${chars.slice(0, 4).join('')}-${chars.slice(4).join('')}`
}

function normalizeCode(input: string) {
  const letters = input.toUpperCase().replace(/[^A-Z]/g, '')
  return letters.length === 8 ? `${letters.slice(0, 4)}-${letters.slice(4)}` : null
}

export async function startCliSetup(db: DbOrTx, input: z.input<typeof startCliSetupInput>, bearer?: string) {
  const data = startCliSetupInput.parse(input)
  const expected = bearer ? await resolveApiToken(db, bearer) : null
  if (bearer && !expected) throw new DomainError('forbidden', 'The CLI token is invalid or expired')
  await db.delete(cliSetup).where(lt(cliSetup.expiresAt, new Date()))
  const deviceCode = randomToken()
  const code = userCode()
  await db.insert(cliSetup).values({
    deviceCodeHash: sha256(deviceCode),
    userCode: code,
    clientName: data.clientName,
    proposal: data.proposal,
    expectedUserId: expected?.userId,
    expiresAt: new Date(Date.now() + cliSetupTtlSeconds * 1000),
  })
  return { deviceCode, userCode: code, expiresIn: cliSetupTtlSeconds, interval: cliSetupInterval }
}

async function activeByCode(db: DbOrTx, input: string) {
  const code = normalizeCode(input)
  const row = code ? await db.query.cliSetup.findFirst({ where: eq(cliSetup.userCode, code) }) : undefined
  if (!row || row.expiresAt < new Date() || row.status === 'denied' || row.status === 'consumed')
    throw new DomainError('not_found', 'This setup code is invalid or has expired')
  return row
}

export async function getCliSetup(db: DbOrTx, userId: string, code: string) {
  const row = await activeByCode(db, code)
  if (row.expectedUserId && row.expectedUserId !== userId)
    throw new DomainError('forbidden', 'Sign in with the same account as the CLI')
  if (row.userId && row.userId !== userId)
    throw new DomainError('forbidden', 'This setup belongs to another account')
  return {
    userCode: row.userCode,
    clientName: row.clientName,
    status: row.status,
    proposal: cliSetupProposal.parse(row.proposal),
    tenantId: row.tenantId,
    projectId: row.projectId,
    connectionId: row.connectionId,
    warning: row.warning,
    expiresAt: row.expiresAt,
  }
}

export async function claimCliSetup(db: DbOrTx, userId: string, code: string) {
  const row = await activeByCode(db, code)
  if (row.expectedUserId && row.expectedUserId !== userId)
    throw new DomainError('forbidden', 'Sign in with the same account as the CLI')
  if (row.userId && row.userId !== userId)
    throw new DomainError('forbidden', 'This setup belongs to another account')
  if (row.status === 'pending')
    await db
      .update(cliSetup)
      .set({ userId, status: 'claimed' })
      .where(and(eq(cliSetup.id, row.id), eq(cliSetup.status, 'pending')))
  return getCliSetup(db, userId, code)
}

export async function denyCliSetup(db: DbOrTx, userId: string, code: string) {
  const row = await activeByCode(db, code)
  if (row.expectedUserId && row.expectedUserId !== userId)
    throw new DomainError('forbidden', 'Sign in with the same account as the CLI')
  if (row.userId && row.userId !== userId)
    throw new DomainError('forbidden', 'This setup belongs to another account')
  await db
    .update(cliSetup)
    .set({ userId, status: 'denied' })
    .where(and(eq(cliSetup.id, row.id), eq(cliSetup.status, 'pending')))
}

export async function setCliSetupConnection(
  db: DbOrTx,
  userId: string,
  code: string,
  connectionId: string,
  tenantId: string,
) {
  const row = await activeByCode(db, code)
  if (row.userId !== userId || row.status !== 'claimed')
    throw new DomainError('forbidden', 'Confirm this setup before connecting a repository')
  await db.update(cliSetup).set({ connectionId, tenantId }).where(eq(cliSetup.id, row.id))
}

export async function completeCliSetup(
  db: DbOrTx,
  userId: string,
  code: string,
  result: { tenantId: string; projectId: string; runId?: string; warning?: string },
) {
  const row = await activeByCode(db, code)
  if (row.userId !== userId || row.status !== 'claimed')
    throw new DomainError('forbidden', 'This setup cannot be completed')
  const [completed] = await db
    .update(cliSetup)
    .set({
      status: 'completed',
      tenantId: result.tenantId,
      projectId: result.projectId,
      runId: result.runId,
      warning: result.warning,
    })
    .where(and(eq(cliSetup.id, row.id), eq(cliSetup.status, 'claimed')))
    .returning({ id: cliSetup.id })
  if (!completed) throw new DomainError('conflict', 'This setup is already being completed')
}

export async function updateCliSetupOutcome(
  db: DbOrTx,
  userId: string,
  code: string,
  result: { runId?: string; warning?: string },
) {
  const normalized = normalizeCode(code)
  if (!normalized) return
  await db
    .update(cliSetup)
    .set({ runId: result.runId, warning: result.warning })
    .where(
      and(eq(cliSetup.userCode, normalized), eq(cliSetup.userId, userId), eq(cliSetup.status, 'completed')),
    )
}

export type CliSetupPoll =
  | { status: 'authorization_pending' | 'slow_down' | 'expired_token' | 'access_denied' }
  | {
      status: 'completed'
      token: string
      userId: string
      tenantId: string
      projectId: string
      runId: string | null
      warning: string | null
    }

export async function pollCliSetup(db: DbOrTx, deviceCode: string): Promise<CliSetupPoll> {
  const row = await db.query.cliSetup.findFirst({
    where: eq(cliSetup.deviceCodeHash, sha256(deviceCode)),
  })
  if (!row || row.status === 'consumed' || row.expiresAt < new Date()) return { status: 'expired_token' }
  if (row.status === 'denied') return { status: 'access_denied' }
  if (row.status !== 'completed') {
    const now = new Date()
    const tooSoon =
      row.lastPolledAt && now.getTime() - row.lastPolledAt.getTime() < (cliSetupInterval - 1) * 1000
    await db.update(cliSetup).set({ lastPolledAt: now }).where(eq(cliSetup.id, row.id))
    return { status: tooSoon ? 'slow_down' : 'authorization_pending' }
  }
  return db.transaction(async (tx) => {
    const [claimed] = await tx
      .update(cliSetup)
      .set({ status: 'consumed' })
      .where(and(eq(cliSetup.id, row.id), eq(cliSetup.status, 'completed')))
      .returning({
        userId: cliSetup.userId,
        tenantId: cliSetup.tenantId,
        projectId: cliSetup.projectId,
        runId: cliSetup.runId,
        warning: cliSetup.warning,
      })
    if (!claimed?.userId || !claimed.tenantId || !claimed.projectId)
      return { status: 'expired_token' as const }
    const { token } = await createApiToken(tx, claimed.userId, {
      name: row.clientName,
      access: 'write',
      tenantId: null,
      expiresInDays: 365,
    })
    return {
      status: 'completed' as const,
      token,
      userId: claimed.userId,
      tenantId: claimed.tenantId,
      projectId: claimed.projectId,
      runId: claimed.runId,
      warning: claimed.warning,
    }
  })
}
