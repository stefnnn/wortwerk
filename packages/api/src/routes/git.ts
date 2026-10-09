import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import {
  splitSelection,
  DomainError,
  assertMachineTranslation,
  assertRepoAccess,
  checkRepoAccess,
  repoAccessFixUrl,
  createProjectToken,
  createSyncRun,
  deleteConnection,
  deleteConnectionsByExternalId,
  deleteRepoLink,
  findLinksForPush,
  getRepoLink,
  getRepoLinkById,
  gitClientFor,
  listConnections,
  listProjectTokens,
  localeCode,
  randomToken,
  repoLinkInput,
  revokeProjectToken,
  saveConnection,
  setCliSetupConnection,
  saveRepoLink,
  setRepoWebhook,
  tokenInput,
  type BitbucketClient,
  type Ctx,
  getExportState,
  type RepoLink,
} from '@wortwerk/core'
import { schema } from '@wortwerk/db'
import { verifySignature } from '@wortwerk/git'
import { enqueueProjectJob, type MachineParams, type PullParams, type PushParams } from '@wortwerk/jobs'
import { auth } from '../auth.ts'
import { env } from '../env.ts'
import { db, getBoss, providers, tenantCtx } from '../services.ts'
import { readState, signState } from '../state.ts'
import type { Env } from './context.ts'
import { validate } from './validate.ts'

type Queued =
  | { kind: 'pull'; params: PullParams }
  | { kind: 'push'; params: PushParams }
  | { kind: 'machine'; params: MachineParams }

export async function queueRun(ctx: Ctx, projectId: string, job: Queued) {
  const run = await createSyncRun(ctx, projectId, job.kind, job.params)
  const base = { tenantId: ctx.tenantId, projectId, syncRunId: run.id }
  await enqueueProjectJob(
    await getBoss(),
    job.kind === 'machine'
      ? { type: 'machine', ...base, locale: job.params.locale }
      : { type: job.kind, ...base },
  )
  return run
}

export function assertFilePatterns(project: { files: unknown[] }) {
  if (!project.files.length) {
    throw new DomainError('invalid', 'Add a file pattern such as locales/%locale%.json before syncing')
  }
}

const publicLink = (link: RepoLink | null) => {
  if (!link) return null
  const { webhookSecret: _secret, ...rest } = link
  return { ...rest, accessFixUrl: repoAccessFixUrl(link.connection) }
}

async function removeBitbucketWebhook(ctx: Ctx, link: RepoLink | null) {
  if (!link?.webhookId || link.connection.provider !== 'bitbucket') return
  const client = (await gitClientFor(ctx, providers, link.connectionId)) as BitbucketClient
  await client.deleteWebhook(link.repo, link.webhookId).catch(() => {})
  await setRepoWebhook(ctx, link.projectId, null)
}

export async function installBitbucketWebhook(ctx: Ctx, link: RepoLink) {
  if (link.connection.provider !== 'bitbucket') return
  const client = (await gitClientFor(ctx, providers, link.connectionId)) as BitbucketClient
  const secret = randomToken()
  const id = await client.createWebhook(link.repo, {
    url: `${env.APP_URL}/api/webhooks/bitbucket/${link.id}`,
    secret,
  })
  await setRepoWebhook(ctx, link.projectId, { id, secret })
}

export const tenantGit = new Hono<Env>()
  .get('/connections', async (c) =>
    c.json({
      connections: await listConnections(c.get('ctx')),
      available: { github: Boolean(providers.github), bitbucket: Boolean(providers.bitbucket) },
    }),
  )
  .delete('/connections/:connectionId', async (c) => {
    await deleteConnection(c.get('ctx'), c.req.param('connectionId'))
    return c.body(null, 204)
  })
  .get('/connections/:connectionId/repos', async (c) => {
    const client = await gitClientFor(c.get('ctx'), providers, c.req.param('connectionId'))
    return c.json(await client.listRepos())
  })
  .get('/connect/:provider', (c) => {
    const project = c.req.query('project')
    const setup = c.req.query('setup')
    if (project && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(project))
      throw new DomainError('invalid', 'Invalid project slug')
    if (setup && !/^[A-Z]{4}-[A-Z]{4}$/.test(setup)) throw new DomainError('invalid', 'Invalid setup code')
    const state = signState({
      tenantId: c.get('tenant').id,
      userId: c.get('session').user.id,
      project,
      setup,
    })
    const provider = c.req.param('provider')
    if (provider === 'github' && providers.github) return c.redirect(providers.github.installUrl(state))
    if (provider === 'bitbucket' && providers.bitbucket)
      return c.redirect(providers.bitbucket.authorizeUrl(state))
    throw new DomainError('not_found', `${provider} is not configured`)
  })

export const projectGit = new Hono<Env>()
  .get('/repo', async (c) => {
    const ctx = c.get('ctx')
    const link = await getRepoLink(ctx, c.get('project').id)
    const exportState = link?.lastPulledAt ? await getExportState(ctx, link) : null
    return c.json(link && { ...publicLink(link)!, exportState })
  })
  .put('/repo', validate('json', repoLinkInput), async (c) => {
    const ctx = c.get('ctx')
    const project = c.get('project')
    const input = c.req.valid('json')
    await assertRepoAccess(ctx, providers, input.connectionId, input.repo)
    const { link, previous } = await saveRepoLink(ctx, project.id, input)
    const moved = !previous || previous.repo !== link.repo || previous.connectionId !== link.connectionId
    let webhookError: string | null = null
    if (moved || (link.connection.provider === 'bitbucket' && !link.webhookId)) {
      try {
        if (moved) await removeBitbucketWebhook(ctx, previous)
        await installBitbucketWebhook(ctx, link)
      } catch (error) {
        webhookError = error instanceof Error ? error.message : String(error)
      }
    }
    if ((moved || previous.branch !== link.branch) && project.files.length) {
      await queueRun(ctx, project.id, { kind: 'pull', params: { trigger: 'connect', force: true } })
    }
    return c.json({ link: publicLink(await getRepoLink(ctx, project.id)), webhookError })
  })
  .delete('/repo', async (c) => {
    const ctx = c.get('ctx')
    await removeBitbucketWebhook(ctx, await getRepoLink(ctx, c.get('project').id)).catch(() => {})
    await deleteRepoLink(ctx, c.get('project').id)
    return c.body(null, 204)
  })
  .post('/repo/check', async (c) => {
    const ctx = c.get('ctx')
    const link = await getRepoLink(ctx, c.get('project').id)
    if (!link) throw new DomainError('invalid', 'Connect a repository first')
    await checkRepoAccess(ctx, providers, link)
    return c.json(publicLink(await getRepoLink(ctx, c.get('project').id)))
  })
  .post('/repo/sync', async (c) => {
    const ctx = c.get('ctx')
    if (!(await getRepoLink(ctx, c.get('project').id)))
      throw new DomainError('invalid', 'Connect a repository first')
    assertFilePatterns(c.get('project'))
    const params = { force: true, trigger: 'manual' as const }
    return c.json(await queueRun(ctx, c.get('project').id, { kind: 'pull', params }), 202)
  })
  .post('/repo/export', async (c) => {
    const ctx = c.get('ctx')
    if (!(await getRepoLink(ctx, c.get('project').id)))
      throw new DomainError('invalid', 'Connect a repository first')
    return c.json(
      await queueRun(ctx, c.get('project').id, { kind: 'push', params: { trigger: 'manual' } }),
      202,
    )
  })
  .post(
    '/machine',
    validate(
      'json',
      z.object({
        locale: localeCode,
        keyIds: z.array(z.string()).max(1000).optional(),
        selection: z.record(z.string(), z.unknown()).optional(),
      }),
    ),
    async (c) => {
      const ctx = c.get('ctx')
      await assertMachineTranslation(ctx)
      const projectId = c.get('project').id
      const body = c.req.valid('json')
      // a selection across locales becomes one job per locale, which then run in parallel
      const parts = body.selection
        ? await splitSelection(ctx, projectId, body.locale, body.selection)
        : [{ locale: body.locale, selection: undefined }]
      const runs = []
      for (const part of parts) {
        runs.push(
          await queueRun(ctx, projectId, {
            kind: 'machine',
            params: { locale: part.locale, keyIds: body.keyIds, selection: part.selection },
          }),
        )
      }
      return c.json(runs[0] ?? null, 202)
    },
  )
  .get('/tokens', async (c) => c.json(await listProjectTokens(c.get('ctx'), c.get('project').id)))
  .post('/tokens', validate('json', tokenInput), async (c) =>
    c.json(await createProjectToken(c.get('ctx'), c.get('project').id, c.req.valid('json')), 201),
  )
  .delete('/tokens/:tokenId', async (c) => {
    await revokeProjectToken(c.get('ctx'), c.get('project').id, c.req.param('tokenId'))
    return c.body(null, 204)
  })

async function finishConnect(c: { req: { raw: Request } }, stateValue: string | undefined) {
  const state = readState(stateValue)
  if (!state) throw new HTTPException(400, { message: 'The connection request expired, please try again' })
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  if (session?.user.id !== state.userId)
    throw new HTTPException(403, { message: 'Sign in with the same account' })
  const [membership] = await db
    .select({ slug: schema.tenant.slug })
    .from(schema.member)
    .innerJoin(schema.tenant, eq(schema.tenant.id, schema.member.organizationId))
    .where(and(eq(schema.member.organizationId, state.tenantId), eq(schema.member.userId, state.userId)))
  if (!membership) throw new HTTPException(403, { message: 'Not a member of this workspace' })
  return {
    ctx: tenantCtx(state.tenantId, state.userId),
    slug: membership.slug,
    project: state.project,
    setup: state.setup,
    userId: state.userId,
    tenantId: state.tenantId,
  }
}

function connectionReturn(
  slug: string,
  project: string | undefined,
  setup: string | undefined,
  status: string,
) {
  if (setup) return `/cli/setup?code=${encodeURIComponent(setup)}&connect=${status}`
  return project ? `/t/${slug}/p/${project}/setup?connect=${status}` : `/t/${slug}/settings?connect=${status}`
}

export const integrations = new Hono()
  .get('/github/callback', async (c) => {
    const app = providers.github
    if (!app) throw new HTTPException(404)
    const { ctx, slug, project, setup, userId, tenantId } = await finishConnect(c, c.req.query('state'))
    const installationId = c.req.query('installation_id')
    const code = c.req.query('code')
    if (c.req.query('setup_action') === 'request')
      return c.redirect(connectionReturn(slug, project, setup, 'requested'))
    if (!installationId || !code)
      throw new HTTPException(400, { message: 'Missing installation or authorization' })
    if (!(await app.userCanAccessInstallation(code, installationId))) {
      throw new HTTPException(403, { message: 'This GitHub installation is not accessible to you' })
    }
    const installation = await app.getInstallation(installationId)
    const connection = await saveConnection(ctx, {
      provider: 'github',
      externalId: installation.id,
      accountName: installation.account,
      accountType: installation.accountType ?? undefined,
    })
    if (setup) await setCliSetupConnection(db, userId, setup, connection.id, tenantId)
    return c.redirect(connectionReturn(slug, project, setup, 'github'))
  })
  .get('/bitbucket/callback', async (c) => {
    const oauth = providers.bitbucket
    if (!oauth) throw new HTTPException(404)
    const { ctx, slug, project, setup, userId, tenantId } = await finishConnect(c, c.req.query('state'))
    const code = c.req.query('code')
    if (!code) return c.redirect(connectionReturn(slug, project, setup, 'cancelled'))
    const credentials = await oauth.exchangeCode(code)
    const user = await oauth.getUser(credentials.accessToken)
    const connection = await saveConnection(ctx, {
      provider: 'bitbucket',
      externalId: user.id,
      accountName: user.name,
      credentials,
    })
    if (setup) await setCliSetupConnection(db, userId, setup, connection.id, tenantId)
    return c.redirect(connectionReturn(slug, project, setup, 'bitbucket'))
  })

export const webhooks = new Hono()
  .post('/github', async (c) => {
    const app = providers.github
    if (!app) throw new HTTPException(404)
    const body = await c.req.text()
    if (!verifySignature(app.config.webhookSecret, body, c.req.header('x-hub-signature-256'))) {
      throw new HTTPException(401, { message: 'Invalid signature' })
    }
    const event = c.req.header('x-github-event')
    const payload = JSON.parse(body)
    if (event === 'installation' && payload.action === 'deleted') {
      await deleteConnectionsByExternalId(db, 'github', String(payload.installation.id))
    }
    if (event !== 'push' || payload.deleted || !String(payload.ref).startsWith('refs/heads/')) {
      return c.json({ queued: 0 }, 202)
    }
    const links = await findLinksForPush(db, {
      provider: 'github',
      externalId: String(payload.installation?.id),
      repo: String(payload.repository?.full_name),
      branch: String(payload.ref).slice('refs/heads/'.length),
    })
    for (const link of links) {
      await queueRun(tenantCtx(link.tenantId), link.projectId, {
        kind: 'pull',
        params: { sha: String(payload.after), trigger: 'webhook' },
      })
    }
    return c.json({ queued: links.length }, 202)
  })
  .post('/bitbucket/:linkId', async (c) => {
    const link = await getRepoLinkById(db, c.req.param('linkId'))
    if (!link?.webhookSecret) throw new HTTPException(404)
    const body = await c.req.text()
    if (!verifySignature(link.webhookSecret, body, c.req.header('x-hub-signature'))) {
      throw new HTTPException(401, { message: 'Invalid signature' })
    }
    if (c.req.header('x-event-key') !== 'repo:push') return c.json({ queued: 0 }, 202)
    const changes = (JSON.parse(body).push?.changes ?? []) as Array<{
      new?: { type?: string; name?: string; target?: { hash?: string } }
    }>
    const change = changes.find((ch) => ch.new?.type === 'branch' && ch.new.name === link.branch)
    if (!change?.new?.target?.hash) return c.json({ queued: 0 }, 202)
    await queueRun(tenantCtx(link.tenantId), link.projectId, {
      kind: 'pull',
      params: { sha: change.new.target.hash, trigger: 'webhook' },
    })
    return c.json({ queued: 1 }, 202)
  })
