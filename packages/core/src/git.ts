import { and, asc, eq, sql } from 'drizzle-orm'
import { schema, type Db } from '@wortwerk/db'
import {
  createBitbucketClient,
  type BitbucketCredentials,
  type BitbucketOAuth,
  type FileChange,
  type GitClient,
  type GitHubApp,
  type ProviderKind,
} from '@wortwerk/git'
import { z } from 'zod'
import { DomainError, notFound, type Ctx } from './context.ts'
import { exportFileContent, importFileContent, type ImportResult } from './files.ts'
import { filePathFor, getProject, localeCode } from './projects.ts'
import { openSecret, sealSecret } from './secrets.ts'

const { gitConnection, projectRepo } = schema

export type GitProviders = { github?: GitHubApp; bitbucket?: BitbucketOAuth }
export type BitbucketClient = ReturnType<typeof createBitbucketClient>

export async function listConnections(ctx: Ctx) {
  return ctx.db
    .select({
      id: gitConnection.id,
      provider: gitConnection.provider,
      accountName: gitConnection.accountName,
      createdAt: gitConnection.createdAt,
    })
    .from(gitConnection)
    .where(eq(gitConnection.tenantId, ctx.tenantId))
    .orderBy(asc(gitConnection.provider), asc(gitConnection.accountName))
}

export async function saveConnection(
  ctx: Ctx,
  input: { provider: ProviderKind; externalId: string; accountName: string; credentials?: unknown },
) {
  const credentials = input.credentials === undefined ? null : sealSecret(input.credentials)
  const [row] = await ctx.db
    .insert(gitConnection)
    .values({
      tenantId: ctx.tenantId,
      provider: input.provider,
      externalId: input.externalId,
      accountName: input.accountName,
      credentials,
      createdById: ctx.userId,
    })
    .onConflictDoUpdate({
      target: [gitConnection.tenantId, gitConnection.provider, gitConnection.externalId],
      set: { accountName: input.accountName, credentials, updatedAt: new Date() },
    })
    .returning({ id: gitConnection.id })
  return row!
}

export async function getConnection(ctx: Ctx, id: string) {
  const row = await ctx.db.query.gitConnection.findFirst({
    where: and(eq(gitConnection.tenantId, ctx.tenantId), eq(gitConnection.id, id)),
  })
  return row ?? notFound('Git connection')
}

export async function deleteConnection(ctx: Ctx, id: string) {
  await ctx.db
    .delete(gitConnection)
    .where(and(eq(gitConnection.tenantId, ctx.tenantId), eq(gitConnection.id, id)))
}

export async function gitClientFor(
  ctx: Ctx,
  providers: GitProviders,
  connectionId: string,
): Promise<GitClient> {
  const connection = await getConnection(ctx, connectionId)
  if (connection.provider === 'github') {
    if (!providers.github) throw new DomainError('invalid', 'The GitHub App is not configured')
    return providers.github.client(connection.externalId)
  }
  const oauth = providers.bitbucket
  if (!oauth) throw new DomainError('invalid', 'Bitbucket is not configured')
  if (!connection.credentials) throw new DomainError('invalid', 'Bitbucket connection has no credentials')
  let credentials = openSecret<BitbucketCredentials>(connection.credentials)
  return createBitbucketClient(async () => {
    if (credentials.expiresAt - Date.now() < 2 * 60_000) {
      credentials = await oauth.refresh(credentials)
      await ctx.db
        .update(gitConnection)
        .set({ credentials: sealSecret(credentials), updatedAt: new Date() })
        .where(eq(gitConnection.id, connection.id))
    }
    return credentials.accessToken
  })
}

const branchName = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(/^(?!\/|.*\/\/|.*\.\.|.*\/$)[\w./-]+$/, 'Invalid branch name')

export const repoLinkInput = z.object({
  connectionId: z.string().min(1),
  repo: z
    .string()
    .trim()
    .regex(/^[\w.-]+\/[\w.-]+$/, 'Use owner/name'),
  branch: branchName,
  exportBranch: branchName.default('wortwerk/translations'),
  localeAliases: z.record(localeCode, z.string().trim().min(1).max(40)).default({}),
  autoExport: z.boolean().default(true),
})

export async function getRepoLink(ctx: Ctx, projectId: string) {
  const row = await ctx.db.query.projectRepo.findFirst({
    where: and(eq(projectRepo.tenantId, ctx.tenantId), eq(projectRepo.projectId, projectId)),
    with: { connection: { columns: { id: true, provider: true, accountName: true } } },
  })
  return row ?? null
}

export type RepoLink = NonNullable<Awaited<ReturnType<typeof getRepoLink>>>

export async function saveRepoLink(ctx: Ctx, projectId: string, input: z.input<typeof repoLinkInput>) {
  const data = repoLinkInput.parse(input)
  if (data.branch === data.exportBranch) {
    throw new DomainError('invalid', 'The export branch must differ from the tracked branch')
  }
  await getConnection(ctx, data.connectionId)
  const previous = await getRepoLink(ctx, projectId)
  const moved = previous && (previous.repo !== data.repo || previous.branch !== data.branch)
  await ctx.db
    .insert(projectRepo)
    .values({ tenantId: ctx.tenantId, projectId, ...data })
    .onConflictDoUpdate({
      target: projectRepo.projectId,
      set: {
        ...data,
        updatedAt: new Date(),
        ...(moved ? { lastPulledSha: null, lastPushedSha: null, pullRequestUrl: null } : {}),
      },
    })
  return { link: (await getRepoLink(ctx, projectId))!, previous }
}

export async function setRepoWebhook(
  ctx: Ctx,
  projectId: string,
  webhook: { id: string; secret: string } | null,
) {
  await ctx.db
    .update(projectRepo)
    .set({ webhookId: webhook?.id ?? null, webhookSecret: webhook?.secret ?? null })
    .where(and(eq(projectRepo.tenantId, ctx.tenantId), eq(projectRepo.projectId, projectId)))
}

export async function deleteRepoLink(ctx: Ctx, projectId: string) {
  const [row] = await ctx.db
    .delete(projectRepo)
    .where(and(eq(projectRepo.tenantId, ctx.tenantId), eq(projectRepo.projectId, projectId)))
    .returning()
  return row ?? null
}

const repoLocale = (link: { localeAliases: Record<string, string> }, locale: string) =>
  link.localeAliases[locale] ?? locale

export type PullFileResult = { path: string; locale: string; missing?: true } & Partial<ImportResult>

export async function pullFromRepo(
  ctx: Ctx,
  client: GitClient,
  input: {
    projectId: string
    sha?: string
    importTranslations?: boolean
    overwrite?: boolean
    force?: boolean
  },
) {
  const project = await getProject(ctx, { id: input.projectId })
  const link = (await getRepoLink(ctx, project.id)) ?? notFound('Repository connection')
  const sha = input.sha ?? (await client.getBranchHead(link.repo, link.branch))
  if (!sha) throw new DomainError('not_found', `Branch ${link.branch} not found in ${link.repo}`)
  if (sha === link.lastPulledSha && !input.importTranslations && !input.force) {
    return { sha, skipped: true, changed: false, files: [] as PullFileResult[] }
  }
  if (!project.files.length) {
    throw new DomainError('invalid', 'Add a file pattern such as locales/%locale%.json before syncing')
  }

  const locales = input.importTranslations
    ? [project.sourceLocale, ...project.locales.map((l) => l.code).filter((l) => l !== project.sourceLocale)]
    : [project.sourceLocale]
  const files: PullFileResult[] = []
  for (const file of project.files) {
    for (const locale of locales) {
      const path = filePathFor(file.path, repoLocale(link, locale))
      const content = await client.readFile(link.repo, sha, path)
      if (content === null) {
        files.push({ path, locale, missing: true })
        continue
      }
      const result = await importFileContent(ctx, {
        projectId: project.id,
        fileId: file.id,
        locale,
        content,
        overwrite: input.overwrite,
        source: 'git',
      })
      files.push({ path, locale, ...result })
    }
  }
  if (files.every((f) => f.missing)) {
    throw new DomainError(
      'not_found',
      `No translation files found at ${sha.slice(0, 7)} (${files.map((f) => f.path).join(', ')})`,
    )
  }

  await ctx.db
    .update(projectRepo)
    .set({ lastPulledSha: sha, lastPulledAt: new Date() })
    .where(eq(projectRepo.id, link.id))
  const changed = files.some((f) => f.keysAdded || f.keysRestored || f.keysObsoleted || f.translationsChanged)
  return { sha, skipped: false, changed, files }
}

export async function pushToRepo(ctx: Ctx, client: GitClient, input: { projectId: string }) {
  const startedAt = new Date()
  const project = await getProject(ctx, { id: input.projectId })
  const link = (await getRepoLink(ctx, project.id)) ?? notFound('Repository connection')
  const base = await client.getBranchHead(link.repo, link.branch)
  if (!base) throw new DomainError('not_found', `Branch ${link.branch} not found in ${link.repo}`)

  const changes: Array<FileChange & { locale: string; count: number }> = []
  for (const file of project.files) {
    for (const { code } of project.locales) {
      if (code === project.sourceLocale) continue
      const exported = await exportFileContent(ctx, { fileId: file.id, locale: code })
      if (!exported.count) continue
      changes.push({
        path: filePathFor(file.path, repoLocale(link, code)),
        content: exported.content,
        locale: code,
        count: exported.count,
      })
    }
  }

  let outcome = { diff: false, updated: false, sha: null as string | null }
  let pullRequestUrl = link.pullRequestUrl
  if (changes.length) {
    outcome = await client.writeBranch(link.repo, {
      branch: link.exportBranch,
      base,
      files: changes.map(({ path, content }) => ({ path, content })),
      message: 'Update translations from wortwerk',
    })
    if (outcome.diff) {
      const lines = changes.map((c) => `- \`${c.path}\` (${c.locale}, ${c.count} strings)`)
      const pr = await client.ensurePullRequest(link.repo, {
        head: link.exportBranch,
        base: link.branch,
        title: 'Update translations from wortwerk',
        body: `Translations exported from the wortwerk project **${project.name}**.\n\n${lines.join('\n')}\n\nThis branch is regenerated on every export. Do not commit to it directly.`,
      })
      pullRequestUrl = pr.url
    }
  }

  await ctx.db
    .update(projectRepo)
    .set({ lastPushedSha: outcome.sha ?? link.lastPushedSha, lastPushedAt: startedAt, pullRequestUrl })
    .where(eq(projectRepo.id, link.id))
  return { base, files: changes.map((c) => c.path), ...outcome, pullRequestUrl }
}

/** System lookups below run before a tenant is known (webhooks, schedulers). */

export async function findLinksForPush(
  db: Db,
  input: { provider: ProviderKind; externalId: string; repo: string; branch: string },
) {
  return db
    .select({ tenantId: projectRepo.tenantId, projectId: projectRepo.projectId })
    .from(projectRepo)
    .innerJoin(gitConnection, eq(gitConnection.id, projectRepo.connectionId))
    .where(
      and(
        eq(gitConnection.provider, input.provider),
        eq(gitConnection.externalId, input.externalId),
        sql`lower(${projectRepo.repo}) = lower(${input.repo})`,
        eq(projectRepo.branch, input.branch),
      ),
    )
}

export async function getRepoLinkById(db: Db, id: string) {
  return (await db.query.projectRepo.findFirst({ where: eq(projectRepo.id, id) })) ?? null
}

export async function deleteConnectionsByExternalId(db: Db, provider: ProviderKind, externalId: string) {
  await db
    .delete(gitConnection)
    .where(and(eq(gitConnection.provider, provider), eq(gitConnection.externalId, externalId)))
}

export async function findDueExports(db: Db, quietSeconds = 60) {
  const result = await db.execute<{ tenant_id: string; project_id: string }>(sql`
    select pr.tenant_id, pr.project_id
    from ${projectRepo} pr
    cross join lateral (
      select max(t.updated_at) as changed
      from ${schema.translation} t
      join ${schema.translationKey} k on k.id = t.key_id
      where t.tenant_id = pr.tenant_id
        and k.project_id = pr.project_id
        and t.updated_at > coalesce(pr.last_pushed_at, pr.created_at)
    ) c
    where pr.auto_export
      and pr.last_pulled_at is not null
      and c.changed is not null
      and c.changed < now() - make_interval(secs => ${quietSeconds})
  `)
  return result.rows.map((r) => ({ tenantId: r.tenant_id, projectId: r.project_id }))
}
