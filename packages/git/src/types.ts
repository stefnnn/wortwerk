export type ProviderKind = 'github' | 'bitbucket'

export type RepoInfo = { fullName: string; defaultBranch: string; private: boolean }

export type FileChange = { path: string; content: string }

export type WriteBranchResult = {
  /** false when the files already match the base branch, nothing to propose */
  diff: boolean
  /** false when the export branch already contained exactly these files */
  updated: boolean
  sha: string | null
}

export interface GitClient {
  listRepos(): Promise<RepoInfo[]>
  getBranchHead(repo: string, branch: string): Promise<string | null>
  readFile(repo: string, ref: string, path: string): Promise<string | null>
  writeBranch(
    repo: string,
    input: { branch: string; base: string; files: FileChange[]; message: string },
  ): Promise<WriteBranchResult>
  ensurePullRequest(
    repo: string,
    input: { head: string; base: string; title: string; body: string },
  ): Promise<{ url: string }>
}

export class GitProviderError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}
