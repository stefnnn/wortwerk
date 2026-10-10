import { and, asc, eq, inArray } from 'drizzle-orm'
import { schema } from '@wortwerk/db'
import { formatFromPath } from '@wortwerk/formats'
import { z } from 'zod'
import { DomainError, canAccessProject, editableLocales, notFound, type Ctx } from './context.ts'
import { assertProjectCapacity } from './limits.ts'

const { project, projectLocale, projectFile } = schema

export const localeCode = z.string().regex(/^[a-z]{2,3}([-_][A-Za-z0-9]{2,8})*$/, 'Invalid locale code')
export const slug = z
  .string()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and dashes')
  .max(64)

export const createProjectInput = z.object({
  name: z.string().trim().min(1).max(120),
  slug,
  sourceLocale: localeCode,
  locales: z.array(localeCode).default([]),
})

export const updateProjectInput = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  sourceLocale: localeCode.optional(),
  instructions: z.string().trim().max(5000).optional(),
})

// guests see the source locale (as reference) plus the locales they were granted
function visibleLocales<P extends { id: string; sourceLocale: string; locales: { code: string }[] }>(
  ctx: Ctx,
  p: P,
): P {
  const editable = editableLocales(ctx, p.id)
  if (!editable) return p
  return { ...p, locales: p.locales.filter((l) => l.code === p.sourceLocale || editable.includes(l.code)) }
}

export async function listProjects(ctx: Ctx) {
  if (ctx.guest && !ctx.guest.size) return []
  const rows = await ctx.db.query.project.findMany({
    where: and(
      eq(project.tenantId, ctx.tenantId),
      ctx.guest ? inArray(project.id, [...ctx.guest.keys()]) : undefined,
    ),
    with: { locales: { columns: { code: true, instructions: true }, orderBy: asc(projectLocale.code) } },
    orderBy: asc(project.name),
  })
  return rows.map((p) => visibleLocales(ctx, p))
}

export async function getProject(ctx: Ctx, slugOrId: { slug: string } | { id: string }) {
  const where =
    'slug' in slugOrId
      ? and(eq(project.tenantId, ctx.tenantId), eq(project.slug, slugOrId.slug))
      : and(eq(project.tenantId, ctx.tenantId), eq(project.id, slugOrId.id))
  const row = await ctx.db.query.project.findFirst({
    where,
    with: {
      locales: { columns: { code: true, instructions: true }, orderBy: asc(projectLocale.code) },
      files: { orderBy: asc(projectFile.path) },
    },
  })
  if (!row || !canAccessProject(ctx, row.id)) notFound('Project')
  return { ...visibleLocales(ctx, row), editableLocales: editableLocales(ctx, row.id) }
}

export type ProjectDetails = Awaited<ReturnType<typeof getProject>>

export async function createProject(ctx: Ctx, input: z.input<typeof createProjectInput>) {
  const data = createProjectInput.parse(input)
  const existing = await ctx.db.query.project.findFirst({
    where: and(eq(project.tenantId, ctx.tenantId), eq(project.slug, data.slug)),
    columns: { id: true },
  })
  if (existing) throw new DomainError('conflict', 'A project with this slug already exists')
  await assertProjectCapacity(ctx)
  const [created] = await ctx.db
    .insert(project)
    .values({ tenantId: ctx.tenantId, name: data.name, slug: data.slug, sourceLocale: data.sourceLocale })
    .returning()
  const codes = [...new Set([data.sourceLocale, ...data.locales])]
  await ctx.db
    .insert(projectLocale)
    .values(codes.map((code) => ({ tenantId: ctx.tenantId, projectId: created!.id, code })))
  return created!
}

export async function updateProject(ctx: Ctx, projectId: string, input: z.input<typeof updateProjectInput>) {
  const data = updateProjectInput.parse(input)
  if (data.sourceLocale) await addLocale(ctx, projectId, data.sourceLocale)
  const [row] = await ctx.db
    .update(project)
    .set(data)
    .where(and(eq(project.tenantId, ctx.tenantId), eq(project.id, projectId)))
    .returning()
  return row ?? notFound('Project')
}

export async function deleteProject(ctx: Ctx, projectId: string) {
  await ctx.db.delete(project).where(and(eq(project.tenantId, ctx.tenantId), eq(project.id, projectId)))
}

export async function addLocale(ctx: Ctx, projectId: string, code: string) {
  await ctx.db
    .insert(projectLocale)
    .values({ tenantId: ctx.tenantId, projectId, code: localeCode.parse(code) })
    .onConflictDoNothing()
}

export async function setLocaleInstructions(ctx: Ctx, projectId: string, code: string, instructions: string) {
  const updated = await ctx.db
    .update(projectLocale)
    .set({ instructions: instructions.trim() })
    .where(
      and(
        eq(projectLocale.tenantId, ctx.tenantId),
        eq(projectLocale.projectId, projectId),
        eq(projectLocale.code, code),
      ),
    )
    .returning({ id: projectLocale.id })
  if (!updated.length) notFound('Locale')
}

export async function removeLocale(ctx: Ctx, projectId: string, code: string) {
  const p = await getProject(ctx, { id: projectId })
  if (p.sourceLocale === code) throw new DomainError('invalid', 'The source locale cannot be removed')
  await ctx.db
    .delete(projectLocale)
    .where(
      and(
        eq(projectLocale.tenantId, ctx.tenantId),
        eq(projectLocale.projectId, projectId),
        eq(projectLocale.code, code),
      ),
    )
}

export const fileInput = z.object({
  path: z
    .string()
    .trim()
    .min(1)
    .max(300)
    .refine((p) => p.includes('%locale%'), 'Path must contain %locale%'),
  format: z.enum(['json', 'yaml', 'po', 'script']).optional(),
  options: z.record(z.string(), z.unknown()).default({}),
})

export async function upsertFile(ctx: Ctx, projectId: string, input: z.input<typeof fileInput>) {
  const parsed = fileInput.parse(input)
  const format = parsed.format ?? formatFromPath(parsed.path)
  if (!format)
    throw new DomainError('invalid', 'Unsupported file type, use .json, .yml/.yaml, .po or .ts/.js')
  const data = { ...parsed, format }
  const [row] = await ctx.db
    .insert(projectFile)
    .values({ tenantId: ctx.tenantId, projectId, ...data })
    .onConflictDoUpdate({ target: [projectFile.projectId, projectFile.path], set: { format: data.format } })
    .returning()
  return row!
}

export async function getFile(ctx: Ctx, fileId: string) {
  const row = await ctx.db.query.projectFile.findFirst({
    where: and(eq(projectFile.tenantId, ctx.tenantId), eq(projectFile.id, fileId)),
  })
  return row ?? notFound('File')
}

export async function deleteFile(ctx: Ctx, fileId: string) {
  await ctx.db
    .delete(projectFile)
    .where(and(eq(projectFile.tenantId, ctx.tenantId), eq(projectFile.id, fileId)))
}

export function filePathFor(pattern: string, locale: string) {
  return pattern.replaceAll('%locale%', locale)
}
