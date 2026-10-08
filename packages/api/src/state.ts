import { createHmac, timingSafeEqual } from 'node:crypto'
import { env } from './env.ts'

type State = { tenantId: string; userId: string; project?: string; exp: number }

const sign = (payload: string) =>
  createHmac('sha256', `${env.BETTER_AUTH_SECRET}:oauth-state`).update(payload).digest('base64url')

export function signState(state: Omit<State, 'exp'>, ttlSeconds = 15 * 60) {
  const payload = Buffer.from(JSON.stringify({ ...state, exp: Date.now() + ttlSeconds * 1000 })).toString(
    'base64url',
  )
  return `${payload}.${sign(payload)}`
}

export function readState(value: string | undefined): State | null {
  const [payload, signature] = (value ?? '').split('.')
  if (!payload || !signature) return null
  const expected = Buffer.from(sign(payload))
  const actual = Buffer.from(signature)
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null
  const state = JSON.parse(Buffer.from(payload, 'base64url').toString()) as State
  return state.exp > Date.now() ? state : null
}
