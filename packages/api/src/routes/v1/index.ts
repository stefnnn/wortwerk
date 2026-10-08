import { Hono } from 'hono'
import { generateSpecs, openAPIRouteHandler } from 'hono-openapi'
import { z } from 'zod'
import {
  DomainError,
  addLocale,
  assertMachineTranslation,
  createKey,
  createKeyInput,
  createProject,
  createProjectInput,
  deviceAuthInput,
  exportFileContent,
  fileInput,
  getFile,
  getKeyInTenant,
  getProject,
  getRepoLink,
  getSyncRun,
  guestRole,
  listKeys,
  listKeysInput,
  listMemberships,
  listProjects,
  listSyncRuns,
  localeCode,
  localeStats,
  pollDeviceAuth,
  removeLocale,
  revokeApiToken,
  setTranslation,
  setTranslationInput,
  startDeviceAuth,
  translationStatuses,
  upsertFile,
  type ProjectDetails,
  type RepoLink,
} from '@wortwerk/core'
import { schema } from '@wortwerk/db'
import { eq } from 'drizzle-orm'
import { env } from '../../env.ts'
import { db, translator } from '../../services.ts'
import { assertFilePatterns, queueRun } from '../git.ts'
import { maxUploadBytes, queueFill, queueImport } from '../projects.ts'
import { workspaceSummary } from '../workspace.ts'
import { allow, authenticate, userTokensOnly, withProject, withWorkspace, type V1Env } from './auth.ts'
import * as s from './docs.ts'
import { doc, input } from './docs.ts'

type RunRow = Awaited<ReturnType<typeof getSyncRun>>

const pickRun = ({ id, kind, status, result, error, createdAt, finishedAt }: RunRow) => ({
  id,
  kind,
  status,
  result,
  error,
  createdAt,
  finishedAt,
})

function projectView(p: ProjectDetails, link: RepoLink | null) {
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    sourceLocale: p.sourceLocale,
    workspaceId: p.tenantId,
    locales: p.locales.map((l) => l.code),
    editableLocales: p.editableLocales,
    files: p.files.map(({ id, path, format }) => ({ id, path, format })),
    repo: link && {
      provider: link.connection.provider,
      repo: link.repo,
      branch: link.branch,
      localeAliases: link.localeAliases,
    },
  }
}

const encodeCursor = (offset: number) => Buffer.from(String(offset)).toString('base64url')
const decodeCursor = (cursor: string | undefined) => {
  const offset = cursor ? Number(Buffer.from(cursor, 'base64url').toString()) : 0
  if (!Number.isInteger(offset) || offset < 0) throw new DomainError('invalid', 'Invalid cursor')
  return offset
}

const keysQuery = listKeysInput.omit({ offset: true, obsolete: true, sync: true }).extend({
  locale: z.string().meta({ description: 'Locale code, or "all" for one row per key and target locale' }),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  cursor: z.string().optional(),
})

const fileQuery = z.object({ locale: localeCode })
const importQuery = fileQuery.extend({
  overwrite: z
    .enum(['true', 'false'])
    .default('false')
    .meta({ description: 'Replace existing translations' }),
})

const device = new Hono<V1Env>()
  .post(
    '/device',
    doc(
      'Auth',
      'Start a device login',
      { 200: { description: 'Codes for the CLI', schema: s.deviceStart } },
      {
        auth: false,
        description:
          'OAuth 2.0 device authorization (RFC 8628). Show `userCode` to the user, open `verificationUriComplete` and poll `POST /auth/token` every `interval` seconds.',
      },
    ),
    input('json', deviceAuthInput),
    async (c) => {
      const started = await startDeviceAuth(db, c.req.valid('json'))
      const verificationUri = `${env.APP_URL}/device`
      return c.json({
        ...started,
        verificationUri,
        verificationUriComplete: `${verificationUri}?code=${started.userCode}`,
      })
    },
  )
  .post(
    '/token',
    doc(
      'Auth',
      'Poll a device login',
      { 200: { description: 'A personal access token', schema: s.deviceToken } },
      {
        auth: false,
        description:
          'Returns 400 with `error` = `authorization_pending`, `slow_down`, `access_denied` or `expired_token` until the user approved the login.',
      },
    ),
    input('json', z.object({ deviceCode: z.string().min(1) })),
    async (c) => {
      const result = await pollDeviceAuth(db, c.req.valid('json').deviceCode)
      if (result.status !== 'approved')
        return c.json({ error: result.status, message: 'The login is not approved (yet)' }, 400)
      const user = await db.query.user.findFirst({
        where: eq(schema.user.id, result.userId),
        columns: { id: true, name: true, email: true },
      })
      return c.json({ token: result.token, user: user! }, 200)
    },
  )

const workspaces = new Hono<V1Env>()
  .use(userTokensOnly)
  .get(
    '/',
    doc('Workspaces', 'List workspaces', {
      200: { description: 'Workspaces', schema: z.array(s.workspace) },
    }),
    async (c) => {
      const principal = c.get('principal')
      if (principal.kind !== 'user') throw new DomainError('forbidden', 'Personal token required')
      const all = await listMemberships(db, principal.userId)
      return c.json(
        all
          .filter((w) => !principal.tenantId || w.id === principal.tenantId)
          .map(({ id, name, slug, plan, role }) => ({ id, name, slug, plan, role })),
      )
    },
  )
  .get(
    '/:workspace',
    withWorkspace,
    allow('read', { guests: true }),
    doc('Workspaces', 'Get a workspace with plan and usage', {
      200: { description: 'Workspace', schema: s.workspaceDetails },
    }),
    async (c) => {
      const t = c.get('tenant')
      return c.json({
        id: t.id,
        name: t.name,
        slug: t.slug,
        role: c.get('role')!,
        ...(await workspaceSummary(c.get('ctx'), t.plan)),
      })
    },
  )
  .get(
    '/:workspace/projects',
    withWorkspace,
    allow('read', { guests: true }),
    doc('Projects', 'List projects', { 200: { description: 'Projects', schema: z.array(s.projectSummary) } }),
    async (c) =>
      c.json(
        (await listProjects(c.get('ctx'))).map((p) => ({
          id: p.id,
          name: p.name,
          slug: p.slug,
          sourceLocale: p.sourceLocale,
          locales: p.locales.map((l) => l.code),
        })),
      ),
  )
  .post(
    '/:workspace/projects',
    withWorkspace,
    allow('write'),
    doc('Projects', 'Create a project', { 201: { description: 'The new project', schema: s.project } }),
    input('json', createProjectInput),
    async (c) => {
      const ctx = c.get('ctx')
      const created = await createProject(ctx, c.req.valid('json'))
      return c.json(projectView(await getProject(ctx, { id: created.id }), null), 201)
    },
  )

const project = new Hono<V1Env>()
  .use(withProject)
  .get(
    '/',
    allow('read', { guests: true }),
    doc('Projects', 'Get a project with locales, files and repository', {
      200: { description: 'Project', schema: s.project },
    }),
    async (c) => {
      const p = c.get('project')
      const link = c.get('role') === guestRole ? null : await getRepoLink(c.get('ctx'), p.id)
      return c.json(projectView(p, link))
    },
  )
  .get(
    '/stats',
    allow('read', { guests: true }),
    doc('Projects', 'Translation progress per locale', {
      200: { description: 'Stats', schema: s.localeStats },
    }),
    async (c) => c.json(await localeStats(c.get('ctx'), c.get('project').id)),
  )
  .post(
    '/locales',
    allow('write'),
    doc('Projects', 'Add a locale', { 204: { description: 'Added' } }),
    input('json', z.object({ code: localeCode })),
    async (c) => {
      const ctx = c.get('ctx')
      await addLocale(ctx, c.get('project').id, c.req.valid('json').code)
      await queueFill(ctx, c.get('project'))
      return c.body(null, 204)
    },
  )
  .delete(
    '/locales/:code',
    allow('write'),
    doc('Projects', 'Remove a locale', { 204: { description: 'Removed' } }),
    async (c) => {
      await removeLocale(c.get('ctx'), c.get('project').id, c.req.param('code'))
      return c.body(null, 204)
    },
  )
  .post(
    '/files',
    allow('write'),
    doc('Files', 'Add or update a file mapping', {
      201: { description: 'File mapping', schema: s.project.shape.files.element },
    }),
    input('json', fileInput),
    async (c) => {
      const ctx = c.get('ctx')
      const p = c.get('project')
      const { id, path, format } = await upsertFile(ctx, p.id, c.req.valid('json'))
      if (!p.files.length && (await getRepoLink(ctx, p.id)))
        await queueRun(ctx, p.id, { kind: 'pull', params: { trigger: 'connect', force: true } })
      return c.json({ id, path, format }, 201)
    },
  )
  .get(
    '/files/:fileId/download',
    allow('read'),
    doc(
      'Files',
      'Download a file in one locale',
      {
        200: {
          description: 'File content. `x-wortwerk-path` holds the path in the repository',
          type: 'text/plain',
        },
      },
      {
        description:
          'Serialized with the same adapter as git exports, so the output matches what a PR would contain.',
      },
    ),
    input('query', fileQuery),
    async (c) => {
      const ctx = c.get('ctx')
      const p = c.get('project')
      const file = await getFile(ctx, c.req.param('fileId'))
      if (file.projectId !== p.id) throw new DomainError('not_found', 'File not found')
      const { locale } = c.req.valid('query')
      const { content } = await exportFileContent(ctx, { fileId: file.id, locale })
      const link = c.get('role') === guestRole ? null : await getRepoLink(ctx, p.id)
      const path = file.path.replaceAll('%locale%', link?.localeAliases[locale] ?? locale)
      return c.body(content, 200, { 'content-type': 'text/plain; charset=utf-8', 'x-wortwerk-path': path })
    },
  )
  .post(
    '/files/:fileId/import',
    allow('write'),
    doc(
      'Files',
      'Upload a file in one locale',
      { 202: { description: 'Queued import run', schema: s.run } },
      {
        description:
          'The request body is the raw file content. Source files of a project connected to a repository come from the repository and cannot be uploaded.',
        rawBody: true,
      },
    ),
    input('query', importQuery),
    async (c) => {
      const ctx = c.get('ctx')
      const p = c.get('project')
      const file = await getFile(ctx, c.req.param('fileId'))
      if (file.projectId !== p.id) throw new DomainError('not_found', 'File not found')
      const { locale, overwrite } = c.req.valid('query')
      if (locale === p.sourceLocale && (await getRepoLink(ctx, p.id)))
        throw new DomainError(
          'invalid',
          'Source files of this project come from its repository, sync it instead',
        )
      const bytes = new Uint8Array(await c.req.arrayBuffer())
      if (!bytes.length) throw new DomainError('invalid', 'The file is empty')
      if (bytes.length > maxUploadBytes) throw new DomainError('invalid', 'File is larger than 20 MB')
      const run = await queueImport(ctx, p.id, {
        fileId: file.id,
        locale,
        bytes,
        overwrite: overwrite === 'true',
        filename: file.path.replaceAll('%locale%', locale).split('/').pop()!,
      })
      return c.json(pickRun(run), 202)
    },
  )
  .get(
    '/keys',
    allow('read', { guests: true }),
    doc('Keys', 'List keys with their source and translation', {
      200: { description: 'One page of keys', schema: s.keyPage },
    }),
    input('query', keysQuery),
    async (c) => {
      const { cursor, ...query } = c.req.valid('query')
      const offset = decodeCursor(cursor)
      const page = await listKeys(c.get('ctx'), c.get('project').id, { ...query, offset })
      const next = offset + page.items.length
      return c.json({
        data: page.items.map((k) => ({
          id: k.id,
          name: k.name,
          context: k.context,
          description: k.description,
          isPlural: k.isPlural,
          fileId: k.fileId,
          locale: k.locale,
          source: k.source,
          value: k.value,
          status: k.status as (typeof translationStatuses)[number],
          updatedAt: k.updatedAt,
        })),
        total: page.total,
        nextCursor: next < page.total ? encodeCursor(next) : null,
      })
    },
  )
  .post(
    '/keys',
    allow('write'),
    doc(
      'Keys',
      'Create a key',
      { 201: { description: 'The key' } },
      {
        description:
          'Only for projects without a repository: keys of a connected project are added in the repository.',
      },
    ),
    input('json', createKeyInput),
    async (c) => {
      const { id, name, context, description, fileId } = await createKey(
        c.get('ctx'),
        c.get('project').id,
        c.req.valid('json'),
      )
      return c.json({ id, name, context, description, fileId }, 201)
    },
  )
  .put(
    '/keys/:keyId/translations/:locale',
    allow('write', { guests: true }),
    doc(
      'Keys',
      'Set a translation',
      { 200: { description: 'The translation', schema: s.translation } },
      {
        description:
          'Source edits may only change wording: placeholders, markup and plural forms must stay as in the repository.',
      },
    ),
    input('json', setTranslationInput),
    async (c) => {
      const ctx = c.get('ctx')
      const key = await getKeyInTenant(ctx, c.req.param('keyId'))
      if (key.projectId !== c.get('project').id) throw new DomainError('not_found', 'Key not found')
      const row = await setTranslation(ctx, key.id, c.req.param('locale'), c.req.valid('json'))
      return c.json({ keyId: row.keyId, locale: row.locale, value: row.value, status: row.status })
    },
  )
  .post(
    '/sync',
    allow('sync'),
    doc('Sync', 'Pull from the repository, optionally export afterwards', {
      202: {
        description: 'Queued runs',
        schema: z.object({ runs: z.array(s.run.pick({ id: true, kind: true, status: true })) }),
      },
    }),
    input('json', z.object({ export: z.boolean().default(false) }).optional()),
    async (c) => {
      const ctx = c.get('ctx')
      const p = c.get('project')
      if (!(await getRepoLink(ctx, p.id)))
        throw new DomainError('invalid', 'The project is not connected to a repository')
      assertFilePatterns(p)
      const trigger = c.get('principal').kind === 'project' ? 'ci' : 'manual'
      const runs = [await queueRun(ctx, p.id, { kind: 'pull', params: { trigger, force: true } })]
      if (c.req.valid('json')?.export)
        runs.push(await queueRun(ctx, p.id, { kind: 'push', params: { trigger } }))
      return c.json({ runs: runs.map(({ id, kind, status }) => ({ id, kind, status })) }, 202)
    },
  )
  .post(
    '/machine',
    allow('write'),
    doc(
      'Sync',
      'Machine-translate every untranslated key of a locale',
      { 202: { description: 'Queued run', schema: s.run } },
      {
        description: 'Paid plans only. Results are marked as needs review.',
      },
    ),
    input('json', z.object({ locale: localeCode })),
    async (c) => {
      const ctx = c.get('ctx')
      await assertMachineTranslation(ctx)
      if (!translator) throw new DomainError('invalid', 'Machine translation is not configured')
      const run = await queueRun(ctx, c.get('project').id, { kind: 'machine', params: c.req.valid('json') })
      return c.json(pickRun(run), 202)
    },
  )
  .get(
    '/runs',
    allow('read'),
    doc('Sync', 'Recent runs', { 200: { description: 'Runs, newest first', schema: z.array(s.run) } }),
    async (c) => c.json((await listSyncRuns(c.get('ctx'), c.get('project').id)).map(pickRun)),
  )
  .get(
    '/runs/:runId',
    allow('read'),
    doc('Sync', 'Get a run', { 200: { description: 'Run', schema: s.run } }),
    async (c) => {
      const run = await getSyncRun(c.get('ctx'), c.req.param('runId'))
      if (run.projectId !== c.get('project').id) throw new DomainError('not_found', 'Sync run not found')
      return c.json(pickRun(run))
    },
  )

const authed = new Hono<V1Env>()
  .use(authenticate)
  .get(
    '/me',
    doc('Auth', 'The token and its user', { 200: { description: 'Token info', schema: s.me } }),
    async (c) => {
      const principal = c.get('principal')
      if (principal.kind === 'project')
        return c.json({
          user: null,
          token: {
            kind: 'project' as const,
            access: 'ci' as const,
            workspaceId: principal.tenantId,
            projectId: principal.projectId,
          },
          workspaces: [],
        })
      const user = await db.query.user.findFirst({
        where: eq(schema.user.id, principal.userId),
        columns: { id: true, name: true, email: true },
      })
      const memberships = await listMemberships(db, principal.userId)
      return c.json({
        user: user!,
        token: {
          kind: 'personal' as const,
          access: principal.access,
          workspaceId: principal.tenantId,
          projectId: null,
        },
        workspaces: memberships
          .filter((w) => !principal.tenantId || w.id === principal.tenantId)
          .map(({ id, name, slug, plan, role }) => ({ id, name, slug, plan, role })),
      })
    },
  )
  .delete(
    '/me/token',
    userTokensOnly,
    doc('Auth', 'Revoke the token used for this request', { 204: { description: 'Revoked' } }),
    async (c) => {
      const principal = c.get('principal')
      if (principal.kind === 'user') await revokeApiToken(db, principal.userId, principal.tokenId)
      return c.body(null, 204)
    },
  )
  .route('/workspaces', workspaces)
  .route('/projects/:projectId', project)

const routes = new Hono<V1Env>().route('/auth', device).route('/', authed)

const specOptions = {
  documentation: {
    info: {
      title: 'wortwerk API',
      version: '1.0.0',
      description:
        'Authenticate with `Authorization: Bearer <token>`: a personal access token (`wwu_…`, account settings or `wortwerk login`) acts as its user; a project token (`ww_…`, project settings) is limited to reading and syncing its project. Errors are `{ "error": code, "message": text }`.',
    },
    servers: [{ url: `${env.APP_URL}/api/v1` }],
    components: { securitySchemes: { bearer: { type: 'http' as const, scheme: 'bearer' } } },
    security: [{ bearer: [] }],
  },
}

export const openApiDocument = () => generateSpecs(routes, specOptions)

// the spec and docs are registered before `routes`, whose authentication middleware matches every path
export const v1 = new Hono<V1Env>()
  .get('/openapi.json', openAPIRouteHandler(routes, specOptions))
  .get('/docs', (c) => c.redirect('/docs/api/reference'))
  .route('/', routes)

export type V1 = typeof routes
