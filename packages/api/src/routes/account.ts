import { Hono } from 'hono'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import {
  apiTokenInput,
  claimCliSetup,
  completeCliSetup,
  createProject,
  createApiToken,
  decideDeviceAuth,
  denyCliSetup,
  fileInput,
  getCliSetup,
  getDeviceAuth,
  getRepoLink,
  gitClientFor,
  guestRole,
  listApiTokens,
  repoLinkInput,
  revokeApiToken,
  saveRepoLink,
  upsertFile,
  updateCliSetupOutcome,
  createProjectInput,
  DomainError,
} from '@wortwerk/core'
import { schema } from '@wortwerk/db'
import { db, providers, storage, tenantCtx } from '../services.ts'
import { requireSession, type Env } from './context.ts'
import { installBitbucketWebhook, queueRun } from './git.ts'
import { validate } from './validate.ts'

const completeSetupInput = z.object({
  tenant: z.string().min(1),
  project: createProjectInput,
  files: z.array(fileInput).min(1).max(20),
  repo: repoLinkInput.optional(),
})

export const account = new Hono<Env>()
  .use(requireSession)
  .get('/tokens', async (c) => c.json(await listApiTokens(db, c.get('session').user.id)))
  .post('/tokens', validate('json', apiTokenInput), async (c) =>
    c.json(await createApiToken(db, c.get('session').user.id, c.req.valid('json')), 201),
  )
  .delete('/tokens/:tokenId', async (c) => {
    await revokeApiToken(db, c.get('session').user.id, c.req.param('tokenId'))
    return c.body(null, 204)
  })
  .get('/device/:code', async (c) => c.json(await getDeviceAuth(db, c.req.param('code'))))
  .post('/device/:code', validate('json', z.object({ approve: z.boolean() })), async (c) => {
    await decideDeviceAuth(db, c.get('session').user.id, c.req.param('code'), c.req.valid('json').approve)
    return c.body(null, 204)
  })
  .get('/setup/:code', async (c) =>
    c.json(await getCliSetup(db, c.get('session').user.id, c.req.param('code'))),
  )
  .post('/setup/:code/claim', async (c) =>
    c.json(await claimCliSetup(db, c.get('session').user.id, c.req.param('code'))),
  )
  .post('/setup/:code/deny', async (c) => {
    await denyCliSetup(db, c.get('session').user.id, c.req.param('code'))
    return c.body(null, 204)
  })
  .post('/setup/:code/complete', validate('json', completeSetupInput), async (c) => {
    const userId = c.get('session').user.id
    const code = c.req.param('code')
    const setup = await getCliSetup(db, userId, code)
    if (setup.status === 'completed' && setup.projectId) return c.json({ projectId: setup.projectId })
    if (setup.status !== 'claimed')
      throw new DomainError('invalid', 'Confirm this setup before completing it')
    const input = c.req.valid('json')
    const [membership] = await db
      .select({ tenant: schema.tenant, role: schema.member.role })
      .from(schema.member)
      .innerJoin(schema.tenant, eq(schema.tenant.id, schema.member.organizationId))
      .where(and(eq(schema.member.userId, userId), eq(schema.tenant.slug, input.tenant)))
    if (!membership || membership.role === guestRole)
      throw new DomainError('not_found', 'Workspace not found')
    if (setup.tenantId && setup.tenantId !== membership.tenant.id)
      throw new DomainError('invalid', 'Use the workspace selected during repository authorization')
    const ctx = tenantCtx(membership.tenant.id, userId)

    if (input.repo) {
      const client = await gitClientFor(ctx, providers, input.repo.connectionId)
      const repository = (await client.listRepos()).find((repo) => repo.fullName === input.repo!.repo)
      if (!repository)
        throw new DomainError('forbidden', 'The connected provider cannot access this repository')
      if (!(await client.getBranchHead(input.repo.repo, input.repo.branch)))
        throw new DomainError('not_found', `Branch ${input.repo.branch} does not exist in ${input.repo.repo}`)
    }

    const created = await db.transaction(async (tx) => {
      const txCtx = { db: tx, tenantId: membership.tenant.id, userId, storage }
      const project = await createProject(txCtx, input.project)
      for (const file of input.files) await upsertFile(txCtx, project.id, file)
      if (input.repo) await saveRepoLink(txCtx, project.id, input.repo)
      await completeCliSetup(tx, userId, code, {
        tenantId: membership.tenant.id,
        projectId: project.id,
      })
      return project
    })

    let runId: string | undefined
    let warning: string | undefined
    if (input.repo) {
      const link = (await getRepoLink(ctx, created.id))!
      try {
        await installBitbucketWebhook(ctx, link)
      } catch (error) {
        warning = `The project was created, but its webhook could not be installed: ${error instanceof Error ? error.message : String(error)}`
      }
      try {
        runId = (
          await queueRun(ctx, created.id, {
            kind: 'pull',
            params: { trigger: 'connect', force: true },
          })
        ).id
      } catch (error) {
        warning = `${warning ? `${warning} ` : ''}The initial sync could not be queued: ${error instanceof Error ? error.message : String(error)}`
      }
    }
    await updateCliSetupOutcome(db, userId, code, { runId, warning })
    return c.json({
      projectId: created.id,
      projectSlug: created.slug,
      runId: runId ?? null,
      warning: warning ?? null,
    })
  })
