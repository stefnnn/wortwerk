import { afterAll, describe, expect, it } from 'vitest'
import { schema } from '@wortwerk/db'
import { db, createTenant } from './helpers.ts'
import { guestRole, listGuestAccess, loadGuest, replaceGrants, setGuestAccess } from '../src/access.ts'
import { addComment, listComments } from '../src/comments.ts'
import { assertMember, type Ctx } from '../src/context.ts'
import { createKey } from '../src/keys.ts'
import { getProject, listProjects, createProject } from '../src/projects.ts'
import { tmSuggestions } from '../src/tm.ts'
import { getKeyInTenant, setTranslation } from '../src/translations.ts'

afterAll(() => db.pool.end())

async function setup() {
  const owner = await createTenant('agency')
  const a = await createProject(owner, { name: 'A', slug: 'a', sourceLocale: 'en', locales: ['de', 'fr'] })
  const b = await createProject(owner, { name: 'B', slug: 'b', sourceLocale: 'en', locales: ['de'] })
  const keyA = await createKey(owner, a.id, { name: 'greeting', sourceValue: 'Welcome to our shop' })
  const keyB = await createKey(owner, b.id, { name: 'welcome', sourceValue: 'Welcome to our shop today' })
  await setTranslation(owner, keyB.id, 'de', { value: 'Willkommen in unserem Laden' })

  const guestId = crypto.randomUUID()
  await db.insert(schema.user).values({ id: guestId, name: 'Guest', email: `${guestId}@example.com` })
  await db.insert(schema.member).values({
    id: crypto.randomUUID(),
    organizationId: owner.tenantId,
    userId: guestId,
    role: guestRole,
    createdAt: new Date(),
  })
  await replaceGrants(db, owner.tenantId, guestId, [{ projectId: a.id, locales: ['de'] }])
  const guest: Ctx = { ...owner, userId: guestId, guest: await loadGuest(db, owner.tenantId, guestId) }
  return { owner, guest, guestId, a, b, keyA, keyB }
}

describe('guest access', () => {
  it('only lists and opens granted projects, with the granted locales plus the source', async () => {
    const { guest, a, b } = await setup()
    const projects = await listProjects(guest)
    expect(projects.map((p) => p.slug)).toEqual(['a'])
    expect(projects[0]!.locales.map((l) => l.code)).toEqual(['de', 'en'])

    const details = await getProject(guest, { id: a.id })
    expect(details.editableLocales).toEqual(['de'])
    await expect(getProject(guest, { id: b.id })).rejects.toMatchObject({ code: 'not_found' })
    await expect(getProject(guest, { slug: 'b' })).rejects.toMatchObject({ code: 'not_found' })
  })

  it('lets members see everything', async () => {
    const { owner } = await setup()
    expect((await listProjects(owner)).map((p) => p.slug)).toEqual(['a', 'b'])
    expect((await getProject(owner, { slug: 'a' })).editableLocales).toBeNull()
  })

  it('edits only granted locales of granted projects', async () => {
    const { guest, keyA, keyB } = await setup()
    await expect(setTranslation(guest, keyA.id, 'de', { value: 'Willkommen' })).resolves.toMatchObject({
      value: 'Willkommen',
    })
    await expect(setTranslation(guest, keyA.id, 'fr', { value: 'Bienvenue' })).rejects.toMatchObject({
      code: 'forbidden',
    })
    // the source locale is reference only when the grant lists other locales
    await expect(setTranslation(guest, keyA.id, 'en', { value: 'Hi' })).rejects.toMatchObject({
      code: 'forbidden',
    })
    await expect(setTranslation(guest, keyB.id, 'de', { value: 'x' })).rejects.toMatchObject({
      code: 'not_found',
    })
  })

  it('treats null locales as every locale of the project', async () => {
    const { owner, guest, guestId, a, keyA } = await setup()
    await setGuestAccess(owner, guestId, [{ projectId: a.id, locales: null }])
    const all = { ...guest, guest: await loadGuest(db, owner.tenantId, guestId) }
    await expect(setTranslation(all, keyA.id, 'fr', { value: 'Bienvenue' })).resolves.toBeDefined()
  })

  it('hides keys, comments and tm matches of other projects', async () => {
    const { owner, guest, keyA, keyB } = await setup()
    await expect(getKeyInTenant(guest, keyB.id)).rejects.toMatchObject({ code: 'not_found' })
    await addComment(owner, keyB.id, { body: 'internal' })
    await expect(listComments(guest, keyB.id)).rejects.toMatchObject({ code: 'not_found' })
    await expect(addComment(guest, keyB.id, { body: 'hello' })).rejects.toMatchObject({ code: 'not_found' })

    // the same text is translated in project B only: the member sees it, the guest does not
    expect((await tmSuggestions(owner, keyA.id, 'de')).length).toBeGreaterThan(0)
    expect(await tmSuggestions(guest, keyA.id, 'de')).toEqual([])
  })

  it('keeps settings for members', async () => {
    const { owner, guest } = await setup()
    expect(() => assertMember(owner)).not.toThrow()
    expect(() => assertMember(guest)).toThrowError(expect.objectContaining({ code: 'forbidden' }))
    await expect(listGuestAccess(guest)).rejects.toMatchObject({ code: 'forbidden' })
  })

  it('validates grants and only applies them to guests', async () => {
    const { owner, guestId, a, b } = await setup()
    await expect(setGuestAccess(owner, guestId, [])).rejects.toMatchObject({ code: 'invalid' })
    await expect(
      setGuestAccess(owner, guestId, [{ projectId: a.id, locales: ['es'] }]),
    ).rejects.toMatchObject({ code: 'invalid' })
    await expect(
      setGuestAccess(owner, guestId, [{ projectId: crypto.randomUUID(), locales: null }]),
    ).rejects.toMatchObject({ code: 'invalid' })
    await expect(
      setGuestAccess(owner, owner.userId!, [{ projectId: a.id, locales: null }]),
    ).rejects.toMatchObject({ code: 'not_found' })

    // a project of another workspace cannot be granted
    const other = await createTenant('free')
    const foreign = await createProject(other, { name: 'X', slug: 'x', sourceLocale: 'en' })
    await expect(
      setGuestAccess(owner, guestId, [{ projectId: foreign.id, locales: null }]),
    ).rejects.toMatchObject({ code: 'invalid' })

    await setGuestAccess(owner, guestId, [
      { projectId: a.id, locales: ['fr'] },
      { projectId: b.id, locales: null },
    ])
    expect(await listGuestAccess(owner)).toHaveLength(2)
    expect([...(await loadGuest(db, owner.tenantId, guestId))]).toEqual(
      expect.arrayContaining([
        [a.id, ['fr']],
        [b.id, null],
      ]),
    )
  })
})
