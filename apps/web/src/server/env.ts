import { z } from 'zod'

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  APP_URL: z.url().default('http://localhost:3010'),
  BETTER_AUTH_SECRET: z.string().min(16),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
  MT_MODEL: z.string().default('openai/gpt-6-luna'),
})

export const env = schema.parse(process.env)
