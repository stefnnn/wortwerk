import type { GitClient } from './types.ts'

type Commit = { sha: string; parent: string | null; files: Map<string, string> }

export function createMemoryRepo(files: Record<string, string>, branch = 'main') {
  let seq = 0
  const commits = new Map<string, Commit>()
  const branches = new Map<string, string>()
  const pulls: Array<{ head: string; base: string; title: string; url: string }> = []

  const commit = (parent: string | null, changes: Record<string, string>) => {
    const sha = `c${++seq}`
    const tree = new Map(parent ? commits.get(parent)!.files : [])
    for (const [path, content] of Object.entries(changes)) tree.set(path, content)
    commits.set(sha, { sha, parent, files: tree })
    return sha
  }
  branches.set(branch, commit(null, files))

  const client: GitClient = {
    listRepos: async () => [{ fullName: 'acme/app', defaultBranch: branch, private: true }],
    getBranchHead: async (_repo, name) => branches.get(name) ?? null,
    readFile: async (_repo, ref, path) => commits.get(branches.get(ref) ?? ref)?.files.get(path) ?? null,
    async writeBranch(_repo, input) {
      const baseFiles = commits.get(input.base)!.files
      if (input.files.every((f) => baseFiles.get(f.path) === f.content)) {
        return { diff: false, updated: false, sha: null }
      }
      const head = branches.get(input.branch)
      if (head) {
        const current = commits.get(head)!
        if (
          current.parent === input.base &&
          input.files.every((f) => current.files.get(f.path) === f.content)
        ) {
          return { diff: true, updated: false, sha: head }
        }
      }
      const sha = commit(input.base, Object.fromEntries(input.files.map((f) => [f.path, f.content])))
      branches.set(input.branch, sha)
      return { diff: true, updated: true, sha }
    },
    async ensurePullRequest(_repo, input) {
      const existing = pulls.find((p) => p.head === input.head && p.base === input.base)
      if (existing) {
        Object.assign(existing, input)
        return { url: existing.url }
      }
      const url = `https://git.example/acme/app/pull/${pulls.length + 1}`
      pulls.push({ ...input, url })
      return { url }
    },
  }

  return {
    client,
    pulls,
    push: (changes: Record<string, string>, name = branch) => {
      const sha = commit(branches.get(name) ?? null, changes)
      branches.set(name, sha)
      return sha
    },
    file: (name: string, path: string) => commits.get(branches.get(name)!)?.files.get(path),
  }
}
