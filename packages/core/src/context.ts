import type { DbOrTx } from '@wortwerk/db'
import type { Storage } from '@wortwerk/storage'

export type Ctx = {
  db: DbOrTx
  tenantId: string
  userId?: string | null
  storage?: Storage
}

export type ErrorCode = 'not_found' | 'conflict' | 'invalid' | 'limit_reached'

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

export function chunks<T>(items: T[], size = 1000): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}
