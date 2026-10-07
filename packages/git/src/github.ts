import { createSign } from 'node:crypto'
import { encodePath, request } from './http.ts'
import type { GitClient, RepoInfo } from './types.ts'

const defaultApi = 'https://api.github.com'

export type GitHubAppConfig = {
  appId: string
  slug: string
  privateKey: string
  webhookSecret: string
  clientId?: string
  clientSecret?: string
  apiUrl?: string
}

type Json = Record<string, any>

const base64url = (input: string | Buffer) => Buffer.from(input).toString('base64url')

export class GitHubApp {
  readonly config: GitHubAppConfig
  readonly #tokens = new Map<string, { token: string; expiresAt: number }>()

  constructor(config: GitHubAppConfig) {
    this.config = { ...config, privateKey: config.privateKey.replace(/\\n/g, '\n') }
  }

  get api() {
    return this.config.apiUrl ?? defaultApi
  }

  installUrl(state: string) {
    return `https://github.com/apps/${this.config.slug}/installations/new?state=${encodeURIComponent(state)}`
  }

  appJwt(now = Math.floor(Date.now() / 1000)) {
    const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
    const payload = base64url(JSON.stringify({ iat: now - 60, exp: now + 540, iss: this.config.appId }))
    const signature = createSign('RSA-SHA256').update(`${header}.${payload}`).sign(this.config.privateKey)
    return `${header}.${payload}.${base64url(signature)}`
  }

  async getInstallation(installationId: string) {
    const res = await request(`${this.api}/app/installations/${installationId}`, {
      headers: headers(this.appJwt()),
    })
    const body = (await res.json()) as Json
    return { id: String(body.id), account: String(body.account?.login ?? installationId) }
  }

  /** Confirms via the user's OAuth code that they can access the installation they were redirected with. */
  async userCanAccessInstallation(code: string, installationId: string) {
    if (!this.config.clientId || !this.config.clientSecret) {
      throw new Error('GITHUB_APP_CLIENT_ID and GITHUB_APP_CLIENT_SECRET are required')
    }
    const res = await request('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        code,
      }),
    })
    const { access_token } = (await res.json()) as { access_token?: string }
    if (!access_token) return false
    for (let page = 1; page <= 10; page++) {
      const list = await request(`${this.api}/user/installations?per_page=100&page=${page}`, {
        headers: headers(access_token),
      })
      const { installations } = (await list.json()) as { installations: Json[] }
      if (installations.some((i) => String(i.id) === installationId)) return true
      if (installations.length < 100) return false
    }
    return false
  }

  async installationToken(installationId: string) {
    const cached = this.#tokens.get(installationId)
    if (cached && cached.expiresAt - Date.now() > 5 * 60_000) return cached.token
    const res = await request(`${this.api}/app/installations/${installationId}/access_tokens`, {
      method: 'POST',
      headers: headers(this.appJwt()),
    })
    const body = (await res.json()) as { token: string; expires_at: string }
    this.#tokens.set(installationId, { token: body.token, expiresAt: Date.parse(body.expires_at) })
    return body.token
  }

  client(installationId: string): GitClient {
    return createGitHubClient(() => this.installationToken(installationId), {
      installation: true,
      apiUrl: this.api,
    })
  }
}

function headers(token: string, accept = 'application/vnd.github+json') {
  return {
    authorization: `Bearer ${token}`,
    accept,
    'x-github-api-version': '2022-11-28',
    'user-agent': 'wortwerk',
  }
}

export function createGitHubClient(
  getToken: () => Promise<string>,
  options: { installation?: boolean; apiUrl?: string } = {},
): GitClient {
  const api = options.apiUrl ?? defaultApi
  const call = async (path: string, init: RequestInit = {}) => {
    const res = await request(`${api}${path}`, {
      ...init,
      headers: { ...headers(await getToken()), 'content-type': 'application/json', ...init.headers },
    })
    return (await res.json()) as Json
  }

  const getBranchHead = async (repo: string, branch: string) => {
    const res = await request(`${api}/repos/${repo}/git/ref/heads/${encodePath(branch)}`, {
      headers: headers(await getToken()),
      allow404: true,
    })
    if (!res) return null
    return String(((await res.json()) as Json).object.sha)
  }

  return {
    async listRepos() {
      const repos: RepoInfo[] = []
      for (let page = 1; page <= 10; page++) {
        const path = options.installation
          ? `/installation/repositories?per_page=100&page=${page}`
          : `/user/repos?per_page=100&page=${page}`
        const body = await call(path)
        const items = (options.installation ? body.repositories : body) as Json[]
        repos.push(
          ...items.map((r) => ({
            fullName: String(r.full_name),
            defaultBranch: String(r.default_branch),
            private: Boolean(r.private),
          })),
        )
        if (items.length < 100) break
      }
      return repos.sort((a, b) => a.fullName.localeCompare(b.fullName))
    },

    getBranchHead,

    async readFile(repo, ref, path) {
      const res = await request(
        `${api}/repos/${repo}/contents/${encodePath(path)}?ref=${encodeURIComponent(ref)}`,
        {
          headers: headers(await getToken(), 'application/vnd.github.raw+json'),
          allow404: true,
        },
      )
      return res ? res.text() : null
    },

    async writeBranch(repo, { branch, base, files, message }) {
      const baseCommit = await call(`/repos/${repo}/git/commits/${base}`)
      const tree = await call(`/repos/${repo}/git/trees`, {
        method: 'POST',
        body: JSON.stringify({
          base_tree: baseCommit.tree.sha,
          tree: files.map((f) => ({ path: f.path, mode: '100644', type: 'blob', content: f.content })),
        }),
      })
      if (tree.sha === baseCommit.tree.sha) return { diff: false, updated: false, sha: null }

      const head = await getBranchHead(repo, branch)
      if (head) {
        const headCommit = await call(`/repos/${repo}/git/commits/${head}`)
        if (headCommit.tree.sha === tree.sha && headCommit.parents?.[0]?.sha === base) {
          return { diff: true, updated: false, sha: head }
        }
      }
      const commit = await call(`/repos/${repo}/git/commits`, {
        method: 'POST',
        body: JSON.stringify({ message, tree: tree.sha, parents: [base] }),
      })
      if (head) {
        await call(`/repos/${repo}/git/refs/heads/${encodePath(branch)}`, {
          method: 'PATCH',
          body: JSON.stringify({ sha: commit.sha, force: true }),
        })
      } else {
        await call(`/repos/${repo}/git/refs`, {
          method: 'POST',
          body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: commit.sha }),
        })
      }
      return { diff: true, updated: true, sha: String(commit.sha) }
    },

    async ensurePullRequest(repo, { head, base, title, body }) {
      const owner = repo.split('/')[0]
      const open = (await call(
        `/repos/${repo}/pulls?state=open&head=${encodeURIComponent(`${owner}:${head}`)}&base=${encodeURIComponent(base)}`,
      )) as unknown as Json[]
      if (open[0]) {
        // the branch is regenerated on every export, so the description must follow
        await call(`/repos/${repo}/pulls/${open[0].number}`, {
          method: 'PATCH',
          body: JSON.stringify({ body }),
        })
        return { url: String(open[0].html_url) }
      }
      const created = await call(`/repos/${repo}/pulls`, {
        method: 'POST',
        body: JSON.stringify({ title, head, base, body }),
      })
      return { url: String(created.html_url) }
    },
  }
}
