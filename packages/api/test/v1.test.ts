import { afterAll, describe, expect, it } from 'vitest'
import {
  createApiToken,
  createProject,
  createProjectToken,
  guestRole,
  importFileContent,
  replaceGrants,
  upsertFile,
  type Ctx,
} from '@wortwerk/core'
import { schema } from '@wortwerk/db'
import { api } from '../src/index.ts'
import { db } from '../src/services.ts'

afterAll(() => db.pool.end())

async function user(name: string) {
  const id = crypto.randomUUID()
  await db.insert(schema.user).values({ id, name, email: `${id}@example.com` })
  return id
}

async function workspace(ownerId: string, plan = 'agency') {
  const id = crypto.randomUUID()
  const slug = `ws-${id.slice(0, 8)}`
  await db.insert(schema.tenant).values({ id, name: 'Acme', slug, createdAt: new Date(), plan })
  await join(id, ownerId, 'owner')
  return { id, slug }
}

async function join(tenantId: string, userId: string, role: string) {
  await db
    .insert(schema.member)
    .values({ id: crypto.randomUUID(), organizationId: tenantId, userId, role, createdAt: new Date() })
}

async function setup() {
  const ownerId = await user('Owner')
  const ws = await workspace(ownerId)
  const ctx: Ctx = { db, tenantId: ws.id, userId: ownerId }
  const app = await createProject(ctx, {
    name: 'App',
    slug: 'app',
    sourceLocale: 'en',
    locales: ['de', 'fr'],
  })
  const other = await createProject(ctx, {
    name: 'Other',
    slug: 'other',
    sourceLocale: 'en',
    locales: ['de'],
  })
  const file = await upsertFile(ctx, app.id, { path: 'locales/%locale%.json' })
  await importFileContent(ctx, {
    projectId: app.id,
    fileId: file.id,
    locale: 'en',
    content: JSON.stringify({ greeting: 'Hello', bye: 'Bye', cart: { title: 'Cart' } }),
  })
  const write = (await createApiToken(db, ownerId, { name: 'cli' })).token
  const read = (await createApiToken(db, ownerId, { name: 'ro', access: 'read' })).token
  const project = (await createProjectToken(ctx, app.id, { name: 'ci' })).token
  return { ownerId, ws, ctx, app, other, file, tokens: { write, read, project } }
}

function call(token: string | null, method: string, path: string, body?: unknown) {
  const headers: Record<string, string> = {}
  if (token) headers.authorization = `Bearer ${token}`
  if (body !== undefined) headers['content-type'] = 'application/json'
  return api.request(`/api/v1${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

describe('v1 authentication', () => {
  it('requires a valid token', async () => {
    expect((await call(null, 'GET', '/me')).status).toBe(401)
    expect((await call('wwu_nope', 'GET', '/me')).status).toBe(401)
  })

  it('describes personal and project tokens', async () => {
    const { tokens, ws, app } = await setup()
    const me = await (await call(tokens.write, 'GET', '/me')).json()
    expect(me).toMatchObject({ user: { name: 'Owner' }, token: { kind: 'personal', access: 'write' } })
    expect(me.workspaces).toEqual([expect.objectContaining({ id: ws.id, role: 'owner' })])

    const ci = await (await call(tokens.project, 'GET', '/me')).json()
    expect(ci).toMatchObject({ user: null, token: { kind: 'project', projectId: app.id } })
  })

  it('revokes the current token on logout', async () => {
    const { tokens } = await setup()
    expect((await call(tokens.write, 'DELETE', '/me/token')).status).toBe(204)
    expect((await call(tokens.write, 'GET', '/me')).status).toBe(401)
  })
})

describe('v1 access', () => {
  it('keeps project tokens on their project, read and sync only', async () => {
    const { tokens, app, other, ws } = await setup()
    expect((await call(tokens.project, 'GET', `/projects/${app.id}`)).status).toBe(200)
    expect((await call(tokens.project, 'GET', `/projects/${other.id}`)).status).toBe(404)
    expect((await call(tokens.project, 'GET', `/workspaces/${ws.slug}/projects`)).status).toBe(403)
    const keys = await (
      await call(tokens.project, 'GET', `/projects/${app.id}/keys?locale=de&name=greeting`)
    ).json()
    const res = await call(
      tokens.project,
      'PUT',
      `/projects/${app.id}/keys/${keys.data[0].id}/translations/de`,
      {
        value: 'Hallo',
      },
    )
    expect(res.status).toBe(403)
  })

  it('lets read tokens read but not write', async () => {
    const { tokens, app, ws } = await setup()
    expect((await call(tokens.read, 'GET', `/workspaces/${ws.slug}`)).status).toBe(200)
    const keys = await (await call(tokens.read, 'GET', `/projects/${app.id}/keys?locale=de&name=bye`)).json()
    const put = await call(
      tokens.read,
      'PUT',
      `/projects/${app.id}/keys/${keys.data[0].id}/translations/de`,
      {
        value: 'Tschüss',
      },
    )
    expect(put.status).toBe(403)
    expect((await call(tokens.read, 'POST', `/projects/${app.id}/locales`, { code: 'it' })).status).toBe(403)
  })

  it('limits workspace-scoped tokens to their workspace', async () => {
    const { ownerId, ws, app } = await setup()
    const second = await workspace(ownerId, 'free')
    const scoped = (await createApiToken(db, ownerId, { name: 'scoped', tenantId: second.id })).token
    expect((await call(scoped, 'GET', `/projects/${app.id}`)).status).toBe(404)
    expect((await call(scoped, 'GET', `/workspaces/${ws.slug}`)).status).toBe(404)
    const listed = await (await call(scoped, 'GET', '/workspaces')).json()
    expect(listed.map((w: { id: string }) => w.id)).toEqual([second.id])
  })

  it('applies the guest scope to personal tokens', async () => {
    const { ws, app, other } = await setup()
    const guestId = await user('Guest')
    await join(ws.id, guestId, guestRole)
    await replaceGrants(db, ws.id, guestId, [{ projectId: app.id, locales: ['de'] }])
    const token = (await createApiToken(db, guestId, { name: 'guest' })).token

    const project = await (await call(token, 'GET', `/projects/${app.id}`)).json()
    expect(project).toMatchObject({ locales: ['de', 'en'], editableLocales: ['de'], repo: null })
    expect((await call(token, 'GET', `/projects/${other.id}`)).status).toBe(404)
    const projects = await (await call(token, 'GET', `/workspaces/${ws.slug}/projects`)).json()
    expect(projects.map((p: { slug: string }) => p.slug)).toEqual(['app'])

    const keys = await (await call(token, 'GET', `/projects/${app.id}/keys?locale=de&name=greeting`)).json()
    const keyId = keys.data[0].id
    expect(
      (await call(token, 'PUT', `/projects/${app.id}/keys/${keyId}/translations/de`, { value: 'Hallo' }))
        .status,
    ).toBe(200)
    expect(
      (await call(token, 'PUT', `/projects/${app.id}/keys/${keyId}/translations/fr`, { value: 'Salut' }))
        .status,
    ).toBe(403)
    expect((await call(token, 'POST', `/projects/${app.id}/locales`, { code: 'it' })).status).toBe(403)
    expect((await call(token, 'GET', `/projects/${app.id}/runs`)).status).toBe(403)
    expect(
      (
        await call(token, 'POST', `/workspaces/${ws.slug}/projects`, {
          name: 'X',
          slug: 'x',
          sourceLocale: 'en',
        })
      ).status,
    ).toBe(403)
  })
})

describe('v1 resources', () => {
  it('pages keys with a cursor and filters by name', async () => {
    const { tokens, app } = await setup()
    const first = await (await call(tokens.write, 'GET', `/projects/${app.id}/keys?locale=de&limit=2`)).json()
    expect(first.total).toBe(3)
    expect(first.data).toHaveLength(2)
    expect(first.data[0]).toMatchObject({ locale: 'de', status: 'untranslated', value: null })
    const second = await (
      await call(tokens.write, 'GET', `/projects/${app.id}/keys?locale=de&limit=2&cursor=${first.nextCursor}`)
    ).json()
    expect(second.data).toHaveLength(1)
    expect(second.nextCursor).toBeNull()
    const names = [...first.data, ...second.data].map((k: { name: string }) => k.name)
    expect(new Set(names)).toEqual(new Set(['greeting', 'bye', 'cart.title']))

    const byName = await (
      await call(tokens.write, 'GET', `/projects/${app.id}/keys?locale=de&name=cart.title`)
    ).json()
    expect(byName.data).toEqual([expect.objectContaining({ name: 'cart.title', source: 'Cart' })])
    expect((await call(tokens.write, 'GET', `/projects/${app.id}/keys?locale=de&cursor=xyz`)).status).toBe(
      400,
    )
  })

  it('sets translations and downloads files', async () => {
    const { tokens, app, file } = await setup()
    const keys = await (
      await call(tokens.write, 'GET', `/projects/${app.id}/keys?locale=de&name=greeting`)
    ).json()
    const put = await call(
      tokens.write,
      'PUT',
      `/projects/${app.id}/keys/${keys.data[0].id}/translations/de`,
      {
        value: 'Hallo',
      },
    )
    expect(await put.json()).toMatchObject({ locale: 'de', value: 'Hallo', status: 'translated' })

    const res = await call(tokens.project, 'GET', `/projects/${app.id}/files/${file.id}/download?locale=de`)
    expect(res.headers.get('x-wortwerk-path')).toBe('locales/de.json')
    expect(JSON.parse(await res.text())).toMatchObject({ greeting: 'Hallo' })
  })

  it('rejects invalid input with the error shape', async () => {
    const { tokens, app } = await setup()
    const res = await call(tokens.write, 'POST', `/projects/${app.id}/locales`, { code: 'not a locale' })
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: 'invalid', message: expect.stringContaining('code') })
  })

  it('creates projects in a workspace', async () => {
    const { tokens, ws } = await setup()
    const res = await call(tokens.write, 'POST', `/workspaces/${ws.slug}/projects`, {
      name: 'Web',
      slug: 'web',
      sourceLocale: 'en',
      locales: ['de'],
    })
    expect(res.status).toBe(201)
    expect(await res.json()).toMatchObject({
      slug: 'web',
      locales: ['de', 'en'],
      workspaceId: ws.id,
      files: [],
    })
  })
})

describe('v1 device login and docs', () => {
  it('starts a device login and reports it pending', async () => {
    const start = await call(null, 'POST', '/auth/device', { clientName: 'wortwerk CLI on test' })
    const body = await start.json()
    expect(body.verificationUriComplete).toBe(`http://wortwerk.test/device?code=${body.userCode}`)
    const poll = await call(null, 'POST', '/auth/token', { deviceCode: body.deviceCode })
    expect(poll.status).toBe(400)
    expect(await poll.json()).toMatchObject({ error: 'authorization_pending' })
  })

  it('serves the OpenAPI document without a token', async () => {
    const res = await call(null, 'GET', '/openapi.json')
    expect(res.status).toBe(200)
    const spec = await res.json()
    expect(spec.paths).toHaveProperty('/projects/{projectId}/keys')
    expect(spec.paths['/auth/device'].post.security).toEqual([])
  })
})
