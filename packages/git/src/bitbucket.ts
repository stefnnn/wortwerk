import { encodePath, request } from './http.ts'
import type { GitClient, RepoInfo } from './types.ts'

const api = 'https://api.bitbucket.org/2.0'
const site = 'https://bitbucket.org/site/oauth2'

export type BitbucketConfig = { clientId: string; clientSecret: string }

export type BitbucketCredentials = { accessToken: string; refreshToken: string; expiresAt: number }

type Json = Record<string, any>

export class BitbucketOAuth {
  readonly config: BitbucketConfig

  constructor(config: BitbucketConfig) {
    this.config = config
  }

  authorizeUrl(state: string) {
    const params = new URLSearchParams({ client_id: this.config.clientId, response_type: 'code', state })
    return `${site}/authorize?${params}`
  }

  async #token(body: Record<string, string>): Promise<BitbucketCredentials> {
    const basic = Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString('base64')
    const res = await request(`${site}/access_token`, {
      method: 'POST',
      headers: { authorization: `Basic ${basic}`, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body),
    })
    const json = (await res.json()) as { access_token: string; refresh_token: string; expires_in: number }
    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      expiresAt: Date.now() + json.expires_in * 1000,
    }
  }

  exchangeCode(code: string) {
    return this.#token({ grant_type: 'authorization_code', code })
  }

  refresh(credentials: BitbucketCredentials) {
    return this.#token({ grant_type: 'refresh_token', refresh_token: credentials.refreshToken })
  }

  async getUser(accessToken: string) {
    const res = await request(`${api}/user`, { headers: { authorization: `Bearer ${accessToken}` } })
    const body = (await res.json()) as Json
    return { id: String(body.uuid), name: String(body.username ?? body.display_name) }
  }
}

export function createBitbucketClient(getToken: () => Promise<string>): GitClient & {
  createWebhook(repo: string, input: { url: string; secret: string }): Promise<string>
  deleteWebhook(repo: string, id: string): Promise<void>
} {
  const auth = async () => ({ authorization: `Bearer ${await getToken()}` })
  const call = async (url: string, init: RequestInit = {}) => {
    const res = await request(url.startsWith('http') ? url : `${api}${url}`, {
      ...init,
      headers: { ...(await auth()), ...init.headers },
    })
    return res.status === 204 ? {} : ((await res.json()) as Json)
  }
  const json = (body: unknown): RequestInit => ({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

  const getBranchHead = async (repo: string, branch: string) => {
    const res = await request(`${api}/repositories/${repo}/refs/branches/${encodePath(branch)}`, {
      headers: await auth(),
      allow404: true,
    })
    return res ? String(((await res.json()) as Json).target.hash) : null
  }

  const readFile = async (repo: string, ref: string, path: string) => {
    const res = await request(`${api}/repositories/${repo}/src/${ref}/${encodePath(path)}`, {
      headers: await auth(),
      allow404: true,
    })
    return res ? res.text() : null
  }

  const matches = async (repo: string, ref: string, files: Array<{ path: string; content: string }>) => {
    for (const file of files) {
      if ((await readFile(repo, ref, file.path)) !== file.content) return false
    }
    return true
  }

  return {
    async listRepos() {
      const repos: RepoInfo[] = []
      let next: string | undefined = `${api}/repositories?role=member&pagelen=100`
      for (let page = 0; next && page < 10; page++) {
        const body = await call(next)
        repos.push(
          ...(body.values as Json[]).map((r) => ({
            fullName: String(r.full_name),
            defaultBranch: String(r.mainbranch?.name ?? 'main'),
            private: Boolean(r.is_private),
          })),
        )
        next = body.next
      }
      return repos.sort((a, b) => a.fullName.localeCompare(b.fullName))
    },

    getBranchHead,
    readFile,

    // The src endpoint cannot force-push, so an existing export branch gets a new commit on top
    // of its head instead of being regenerated from base.
    async writeBranch(repo, { branch, base, files, message }) {
      if (await matches(repo, base, files)) return { diff: false, updated: false, sha: null }
      const head = await getBranchHead(repo, branch)
      if (head && (await matches(repo, head, files))) return { diff: true, updated: false, sha: head }

      const form = new FormData()
      for (const file of files) form.append(file.path, new Blob([file.content]), file.path)
      form.append('message', message)
      form.append('branch', branch)
      form.append('parents', head ?? base)
      const res = await request(`${api}/repositories/${repo}/src`, {
        method: 'POST',
        headers: await auth(),
        body: form,
      })
      const location = res.headers.get('location') ?? ''
      return {
        diff: true,
        updated: true,
        sha: location.split('/').pop() || (await getBranchHead(repo, branch)),
      }
    },

    async ensurePullRequest(repo, { head, base, title, body }) {
      const q = encodeURIComponent(`source.branch.name="${head}" AND state="OPEN"`)
      const open = await call(`/repositories/${repo}/pullrequests?q=${q}`)
      const existing = (open.values as Json[])[0]
      if (existing) return { url: String(existing.links.html.href) }
      const created = await call(
        `/repositories/${repo}/pullrequests`,
        json({
          title,
          description: body,
          source: { branch: { name: head } },
          destination: { branch: { name: base } },
        }),
      )
      return { url: String(created.links.html.href) }
    },

    async createWebhook(repo, { url, secret }) {
      const hook = await call(
        `/repositories/${repo}/hooks`,
        json({ description: 'wortwerk', url, active: true, secret, events: ['repo:push'] }),
      )
      return String(hook.uuid)
    },

    async deleteWebhook(repo, id) {
      await request(`${api}/repositories/${repo}/hooks/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: await auth(),
        allow404: true,
      })
    },
  }
}
