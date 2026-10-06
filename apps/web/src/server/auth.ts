import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { magicLink } from 'better-auth/plugins/magic-link'
import { organization } from 'better-auth/plugins/organization'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { getPlan } from '@wortwerk/core/plans'
import { getDb, schema } from '@wortwerk/db'
import { createMailer, invitationMail, magicLinkMail } from '@wortwerk/mail'
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
      sendMagicLink: async ({ email, url }) => mailer.send(magicLinkMail(email, url)),
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
      membershipLimit: (_user, org) =>
        getPlan((org as { plan?: string }).plan).maxMembers ?? Number.MAX_SAFE_INTEGER,
      sendInvitationEmail: async ({ id, email, organization: org, inviter }) => {
        const url = `${env.APP_URL}/invitations/${id}`
        await mailer.send(
          invitationMail(email, url, { inviter: inviter.user.name || inviter.user.email, team: org.name }),
        )
      },
    }),
    tanstackStartCookies(),
  ],
})

export type Session = typeof auth.$Infer.Session
