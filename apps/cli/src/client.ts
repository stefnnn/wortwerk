import { hc, type ClientResponse } from 'hono/client'
import type { V1 } from '@wortwerk/api'
import pkg from '../package.json' with { type: 'json' }
import {
  defaultHost,
  findProjectConfig,
  normalizeHost,
  readCredentials,
  type ProjectConfig,
} from './config.ts'

export const version = pkg.version

export class CliError extends Error {}

export class ApiError extends CliError {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

export function createClient(host: string, token?: string) {
  const base = `${host}/api/v1`
  const headers: Record<string, string> = { 'user-agent': `wortwerk-cli/${version}` }
  if (token) headers.authorization = `Bearer ${token}`
  return {
    host,
    api: hc<V1>(base, { headers }),
    raw: (path: string, init: RequestInit = {}) =>
      fetch(`${base}${path}`, {
        ...init,
        headers: { ...headers, ...(init.headers as Record<string, string>) },
      }),
  }
}

export type Client = ReturnType<typeof createClient>

export async function failure(res: Response) {
  const body = (await res.json().catch(() => null)) as { error?: string; message?: string } | null
  if (res.status === 401)
    return new ApiError(401, 'unauthorized', 'Not signed in or the token expired. Run `wortwerk login`.')
  return new ApiError(res.status, body?.error ?? 'error', body?.message ?? res.statusText)
}

type Body<R> = R extends ClientResponse<infer T, number, string> ? T : never

export async function unwrap<R extends ClientResponse<unknown, number, string>>(
  promise: Promise<R>,
): Promise<Body<R>> {
  const res = await promise.catch((error: Error) => {
    throw new CliError(
      `Could not reach the server: ${error.cause instanceof Error ? error.cause.message : error.message}`,
    )
  })
  if (!res.ok) throw await failure(res as unknown as Response)
  if (res.status === 204) return undefined as Body<R>
  return (await res.json()) as Body<R>
}

/** Host and token from flags, environment, the project config and the stored login, in that order. */
export async function session(options: { host?: string; project?: ProjectConfig | null } = {}) {
  const credentials = await readCredentials()
  const host = normalizeHost(
    options.host ?? process.env.WORTWERK_HOST ?? options.project?.host ?? credentials.host ?? defaultHost,
  )
  const token = process.env.WORTWERK_TOKEN || credentials.hosts[host]?.token
  if (!token) throw new CliError(`Not signed in to ${host}. Run \`wortwerk login\` first.`)
  return createClient(host, token)
}

export async function projectSession(options: { host?: string } = {}) {
  const found = await findProjectConfig()
  if (!found) throw new CliError('No wortwerk.json found. Run `wortwerk init` in your project folder first.')
  const client = await session({ ...options, project: found.config })
  return { ...found, client }
}
