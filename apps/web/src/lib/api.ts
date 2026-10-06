import { hc, type ClientResponse } from 'hono/client'
import type { Api } from '#/server/api/index.ts'

export const client = hc<Api>(typeof window === 'undefined' ? 'http://localhost' : window.location.origin)

export class ApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

export async function unwrap<T>(promise: Promise<ClientResponse<T>>): Promise<T> {
  const res = await promise
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string; message?: string } | null
    throw new ApiError(res.status, body?.error ?? 'error', body?.message ?? res.statusText)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export const t = client.api.t[':tenant']
