import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { magicLink } from 'better-auth/plugins/magic-link'
import { organization } from 'better-auth/plugins/organization'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { getPlan, guestRole, parseGrants, removeGrants, replaceGrants, validateGrants } from '@wortwerk/core'
import { getDb, schema } from '@wortwerk/db'
import { APIError, createAuthMiddleware, getSessionFromCtx } from 'better-auth/api'
import { and, count, eq } from 'drizzle-orm'
import { createMailer, invitationMail, magicLinkMail, mailLocale, noAccountMail } from '@wortwerk/mail'
import { env } from './env.ts'
import { ac, roles } from '../lib/roles.ts'

const mailer = createMailer()

// listings that would show a guest the other members' emails and pending invitations
const guestBlockedPaths = new Set([
  '/organization/get-full-organization',
  '/organization/list-members',
  '/organization/list-invitations',
])

export const auth = betterAuth({
  baseURL: env.APP_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(getDb(), { provider: 'pg', schema }),
  emailAndPassword: { enabled: true },
  socialProviders:
    env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET
      ? { github: { clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET } }
      : {},
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (!guestBlockedPaths.has(ctx.path)) return
      const session = await getSessionFromCtx(ctx)
      if (!session) return
      const query = (ctx.query ?? {}) as { organizationId?: string; organizationSlug?: string }
      const db = getDb()
      const [row] = await db
        .select({ role: schema.member.role })
        .from(schema.member)
        .innerJoin(schema.tenant, eq(schema.tenant.id, schema.member.organizationId))
        .where(
          and(
            eq(schema.member.userId, session.user.id),
            query.organizationSlug
              ? eq(schema.tenant.slug, query.organizationSlug)
              : eq(schema.tenant.id, query.organizationId ?? session.session.activeOrganizationId ?? ''),
          ),
        )
      if (row?.role === guestRole) throw new APIError('FORBIDDEN', { message: 'Guests cannot list members' })
    }),
  },
  plugins: [
    magicLink({
      disableSignUp: true,
      sendMagicLink: async ({ email, url }, ctx) => {
        const locale = mailLocale(ctx?.request?.headers ?? ctx?.headers)
        const [user] = await getDb()
          .select({ id: schema.user.id })
          .from(schema.user)
          .where(eq(schema.user.email, email.toLowerCase()))
        const signUp = `${env.APP_URL}${locale === 'de' ? '/de' : ''}/sign-up`
        await mailer.send(user ? magicLinkMail(email, url, locale) : noAccountMail(email, signUp, locale))
      },
    }),
    organization({
      ac,
      roles,
      allowUserToCreateOrganization: async (user) => {
        const [owned] = await getDb()
          .select({ id: schema.member.id })
          .from(schema.member)
          .where(and(eq(schema.member.userId, user.id), eq(schema.member.role, 'owner')))
          .limit(1)
        return !owned
      },
      schema: {
        organization: {
          modelName: 'tenant',
          additionalFields: {
            plan: { type: 'string', required: true, defaultValue: 'free', input: false },
          },
        },
        invitation: {
          additionalFields: { grants: { type: 'string', required: false } },
        },
      },
      organizationHooks: {
        beforeCreateInvitation: async ({ invitation, organization: org }) => {
          // guests are invited to specific projects (and locales), everyone else gets no grants
          const isGuest = invitation.role === guestRole
          if (invitation.role.split(',').includes(guestRole) && !isGuest)
            throw new APIError('BAD_REQUEST', { message: 'Guest cannot be combined with other roles' })
          let grants: string | null = null
          if (isGuest) {
            try {
              grants = JSON.stringify(await validateGrants(getDb(), org.id, parseGrants(invitation.grants)))
            } catch (error) {
              throw new APIError('BAD_REQUEST', {
                message: error instanceof Error ? error.message : 'Invalid project access',
              })
            }
          }
          const { maxMembers } = getPlan((org as { plan?: string }).plan)
          if (maxMembers === null) return { data: { grants } }
          const db = getDb()
          const [[members], [pending]] = await Promise.all([
            db.select({ n: count() }).from(schema.member).where(eq(schema.member.organizationId, org.id)),
            db
              .select({ n: count() })
              .from(schema.invitation)
              .where(
                and(eq(schema.invitation.organizationId, org.id), eq(schema.invitation.status, 'pending')),
              ),
          ])
          if ((members?.n ?? 0) + (pending?.n ?? 0) >= maxMembers) {
            throw new APIError('FORBIDDEN', {
              code: 'limit_reached',
              message: `Your plan allows ${maxMembers} ${maxMembers === 1 ? 'member' : 'members'}`,
            })
          }
          return { data: { grants } }
        },
        afterAcceptInvitation: async ({ invitation, member, organization: org }) => {
          if (member.role !== guestRole) return
          try {
            const grants = await validateGrants(getDb(), org.id, parseGrants(invitation.grants))
            await replaceGrants(getDb(), org.id, member.userId, grants)
          } catch {
            // projects were deleted since the invite: the guest joins without access until the owner grants some
          }
        },
        afterRemoveMember: async ({ member, organization: org }) => {
          await removeGrants(getDb(), org.id, member.userId)
        },
      },
      membershipLimit: (_user, org) =>
        getPlan((org as { plan?: string }).plan).maxMembers ?? Number.MAX_SAFE_INTEGER,
      sendInvitationEmail: async ({ id, email, organization: org, inviter }, request) => {
        const locale = mailLocale(request?.headers)
        const url = `${env.APP_URL}${locale === 'de' ? '/de' : ''}/invitations/${id}`
        await mailer.send(
          invitationMail(
            email,
            url,
            { inviter: inviter.user.name || inviter.user.email, team: org.name },
            locale,
          ),
        )
      },
    }),
    tanstackStartCookies(),
  ],
})

export type Session = typeof auth.$Infer.Session
