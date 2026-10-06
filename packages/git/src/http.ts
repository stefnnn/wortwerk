import { GitProviderError } from './types.ts'

export const encodePath = (path: string) => path.split('/').map(encodeURIComponent).join('/')

export async function request(url: string, init: RequestInit & { allow404?: false }): Promise<Response>
export async function request(url: string, init: RequestInit & { allow404: true }): Promise<Response | null>
export async function request(url: string, init: RequestInit & { allow404?: boolean }) {
  const res = await fetch(url, init)
  if (res.status === 404 && init.allow404) return null
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    let message = text.slice(0, 300)
    try {
      const body = JSON.parse(text) as { message?: string; error?: { message?: string } | string }
      message = body.message ?? (typeof body.error === 'string' ? body.error : body.error?.message) ?? message
    } catch {}
    throw new GitProviderError(res.status, `${init.method ?? 'GET'} ${new URL(url).pathname}: ${message}`)
  }
  return res
}
