import type { DbOrTx } from '@wortwerk/db'
import type { Storage } from '@wortwerk/storage'

/** project id -> locales the guest may edit (null = all). */
export type Guest = Map<string, string[] | null>

export type Ctx = {
  db: DbOrTx
  tenantId: string
  userId?: string | null
  storage?: Storage
  // set for guest members only. System contexts (worker, webhooks, project tokens) leave it unset and see everything
  guest?: Guest
}

export type ErrorCode = 'not_found' | 'conflict' | 'invalid' | 'limit_reached' | 'forbidden'

export class DomainError extends Error {
  readonly code: ErrorCode

  constructor(code: ErrorCode, message: string) {
    super(message)
    this.code = code
  }
}

export function notFound(what: string): never {
  throw new DomainError('not_found', `${what} not found`)
}

export function assertMember(ctx: Ctx) {
  if (ctx.guest) throw new DomainError('forbidden', 'Guests cannot change settings')
}

export function canAccessProject(ctx: Ctx, projectId: string) {
  return !ctx.guest || ctx.guest.has(projectId)
}

/** null = every locale */
export function editableLocales(ctx: Ctx, projectId: string): string[] | null {
  if (!ctx.guest) return null
  // no grant at all means nothing is editable, a null grant means every locale
  return ctx.guest.has(projectId) ? ctx.guest.get(projectId)! : []
}

export function assertLocaleEditable(ctx: Ctx, projectId: string, locale: string) {
  const allowed = editableLocales(ctx, projectId)
  if (allowed && !allowed.includes(locale))
    throw new DomainError('forbidden', `You can't edit ${locale} in this project`)
}

export function chunks<T>(items: T[], size = 1000): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}
