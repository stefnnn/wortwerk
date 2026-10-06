import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { magicLink } from 'better-auth/plugins/magic-link'
import { organization } from 'better-auth/plugins/organization'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { getPlan } from '@wortwerk/core/plans'
import { getDb, schema } from '@wortwerk/db'
import { APIError } from 'better-auth/api'
import { and, count, eq } from 'drizzle-orm'
import { createMailer, invitationMail, magicLinkMail, mailLocale, noAccountMail } from '@wortwerk/mail'
import { env } from './env.ts'

const mailer = createMailer()

export const auth = betterAuth({
  baseURL: env.APP_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(getDb(), { provider: 'pg', schema }),
  emailAndPassword: { enabled: true },
  socialProviders:
    env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET
      ? { github: { clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET } }
      : {},
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
      schema: {
        organization: {
          modelName: 'tenant',
          additionalFields: {
            plan: { type: 'string', required: true, defaultValue: 'free', input: false },
          },
        },
      },
      organizationHooks: {
        beforeCreateInvitation: async ({ organization: org }) => {
          const { maxMembers } = getPlan((org as { plan?: string }).plan)
          if (maxMembers === null) return
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
