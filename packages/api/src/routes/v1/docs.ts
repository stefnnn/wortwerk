import type { ValidationTargets } from 'hono'
import { describeRoute, resolver, validator } from 'hono-openapi'
import { z, type ZodType } from 'zod'
import { DomainError, apiTokenAccess, translationStatuses } from '@wortwerk/core'

export function input<T extends ZodType, Target extends keyof ValidationTargets>(target: Target, schema: T) {
  return validator(target, schema, (result) => {
    if (result.success) return
    const [issue] = result.error
    const path = issue?.path?.map((p) => (typeof p === 'object' ? p.key : p)).join('.')
    throw new DomainError('invalid', `${path ? `${path}: ` : ''}${issue?.message ?? 'Invalid input'}`)
  })
}

type Responses = Record<number, { description: string; schema?: ZodType; type?: string }>

export function doc(
  tag: string,
  summary: string,
  responses: Responses,
  extra: { description?: string; auth?: false; rawBody?: true } = {},
) {
  return describeRoute({
    tags: [tag],
    summary,
    description: extra.description,
    ...(extra.auth === false ? { security: [] } : {}),
    ...(extra.rawBody
      ? {
          requestBody: {
            required: true,
            content: { 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } },
          },
        }
      : {}),
    responses: {
      ...Object.fromEntries(
        Object.entries(responses).map(([status, r]) => [
          status,
          {
            description: r.description,
            content: r.schema
              ? { 'application/json': { schema: resolver(r.schema) } }
              : r.type
                ? { [r.type]: { schema: { type: 'string' } } }
                : undefined,
          },
        ]),
      ),
      ...(extra.auth === false ? {} : { 401: { description: 'Missing, invalid or expired token' } }),
      400: { description: 'Invalid input', content: { 'application/json': { schema: resolver(error) } } },
    },
  })
}

const date = z.string().meta({ format: 'date-time' })

export const error = z.object({
  error: z.enum(['not_found', 'conflict', 'invalid', 'limit_reached', 'forbidden', 'http', 'internal']),
  message: z.string(),
})

export const workspace = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  plan: z.string(),
  role: z.string().meta({ description: 'owner, admin, member or guest' }),
})

export const workspaceDetails = workspace.extend({
  plan: z.object({
    id: z.string(),
    maxProjects: z.number().nullable(),
    maxKeys: z.number(),
    maxMembers: z.number().nullable(),
    machineTranslation: z.boolean(),
  }),
  features: z.object({ machineTranslation: z.boolean() }),
  usage: z.object({ projects: z.number(), keys: z.number(), members: z.number() }),
})

export const me = z.object({
  user: z.object({ id: z.string(), name: z.string(), email: z.string() }).nullable(),
  token: z.object({
    kind: z.enum(['personal', 'project']),
    access: z.enum([...apiTokenAccess, 'ci']),
    workspaceId: z.string().nullable().meta({ description: 'null: every workspace of the user' }),
    projectId: z.string().nullable(),
  }),
  workspaces: z.array(workspace),
})

export const projectSummary = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  sourceLocale: z.string(),
  locales: z.array(z.string()),
})

export const project = projectSummary.extend({
  workspaceId: z.string(),
  editableLocales: z
    .array(z.string())
    .nullable()
    .meta({ description: 'Locales a guest may edit, null when every locale is editable' }),
  files: z.array(
    z.object({ id: z.string(), path: z.string(), format: z.enum(['json', 'yaml', 'po', 'script']) }),
  ),
  repo: z
    .object({
      provider: z.enum(['github', 'bitbucket']),
      repo: z.string(),
      branch: z.string(),
      localeAliases: z.record(z.string(), z.string()),
    })
    .nullable(),
})

export const localeStats = z.array(
  z.object({
    locale: z.string(),
    total: z.number(),
    translated: z.number(),
    needsReview: z.number(),
    approved: z.number(),
    untranslated: z.number(),
  }),
)

export const key = z.object({
  id: z.string(),
  name: z.string(),
  context: z.string(),
  description: z.string(),
  isPlural: z.boolean(),
  fileId: z.string().nullable(),
  locale: z.string(),
  source: z.string().nullable(),
  value: z.string().nullable(),
  status: z.enum(translationStatuses),
  updatedAt: date.nullable(),
})

export const keyPage = z.object({
  data: z.array(key),
  total: z.number(),
  nextCursor: z.string().nullable(),
})

export const translation = z.object({
  keyId: z.string(),
  locale: z.string(),
  value: z.string(),
  status: z.enum(translationStatuses),
})

export const run = z.object({
  id: z.string(),
  kind: z.enum(['import', 'export', 'pull', 'push', 'machine']),
  status: z.enum(['queued', 'running', 'succeeded', 'failed']),
  result: z.unknown().nullable(),
  error: z.string().nullable(),
  createdAt: date,
  finishedAt: date.nullable(),
})

export const deviceStart = z.object({
  deviceCode: z.string(),
  userCode: z.string(),
  verificationUri: z.string(),
  verificationUriComplete: z.string(),
  expiresIn: z.number(),
  interval: z.number(),
})

export const deviceToken = z.object({
  token: z.string(),
  user: z.object({ id: z.string(), name: z.string(), email: z.string() }),
})

export const setupStart = deviceStart

export const setupToken = deviceToken.extend({
  workspace: z.object({ id: z.string(), slug: z.string() }),
  project: z.object({ id: z.string(), slug: z.string() }),
  run: z.object({ id: z.string() }).nullable(),
  warning: z.string().nullable(),
})
