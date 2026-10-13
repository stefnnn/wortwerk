import { z } from 'zod'

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  APP_URL: z.url().default('http://localhost:3010'),
  BETTER_AUTH_SECRET: z.string().min(16),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
  MT_MODEL: z.string().default('anthropic/claude-haiku-5.5'),
  ADMIN_EMAIL: z.email().optional(),
  // platform admins (comma separated), allowed into /admin
  ADMIN_EMAILS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean),
    ),
})

export const env = schema.parse(process.env)
