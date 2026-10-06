import { and, asc, eq } from 'drizzle-orm'
import { schema } from '@wortwerk/db'
import { DomainError, notFound, type Ctx } from './context.ts'
import { getKeyInTenant } from './translations.ts'

const { keyScreenshot } = schema

export const screenshotMimeTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
export const maxScreenshotBytes = 5 * 1024 * 1024

function requireStorage(ctx: Ctx) {
  if (!ctx.storage) throw new Error('storage is not configured')
  return ctx.storage
}

export async function listScreenshots(ctx: Ctx, keyId: string) {
  return ctx.db.query.keyScreenshot.findMany({
    where: and(eq(keyScreenshot.tenantId, ctx.tenantId), eq(keyScreenshot.keyId, keyId)),
    orderBy: asc(keyScreenshot.createdAt),
  })
}

export async function addScreenshot(
  ctx: Ctx,
  keyId: string,
  file: { name: string; type: string; bytes: Uint8Array },
) {
  if (!screenshotMimeTypes.includes(file.type)) throw new DomainError('invalid', 'Unsupported image type')
  if (file.bytes.byteLength > maxScreenshotBytes)
    throw new DomainError('invalid', 'Image is larger than 5 MB')
  await getKeyInTenant(ctx, keyId)
  const id = crypto.randomUUID()
  const storageKey = `tenants/${ctx.tenantId}/screenshots/${id}`
  await requireStorage(ctx).put(storageKey, file.bytes)
  const [row] = await ctx.db
    .insert(keyScreenshot)
    .values({
      id,
      tenantId: ctx.tenantId,
      keyId,
      storageKey,
      filename: file.name.slice(0, 200),
      mimeType: file.type,
      size: file.bytes.byteLength,
      uploadedById: ctx.userId,
    })
    .returning()
  return row!
}

export async function readScreenshot(ctx: Ctx, screenshotId: string) {
  const row = await ctx.db.query.keyScreenshot.findFirst({
    where: and(eq(keyScreenshot.tenantId, ctx.tenantId), eq(keyScreenshot.id, screenshotId)),
  })
  if (!row) notFound('Screenshot')
  const bytes = await requireStorage(ctx).get(row.storageKey)
  if (!bytes) notFound('Screenshot')
  return { ...row, bytes }
}

export async function deleteScreenshot(ctx: Ctx, screenshotId: string) {
  const [row] = await ctx.db
    .delete(keyScreenshot)
    .where(and(eq(keyScreenshot.tenantId, ctx.tenantId), eq(keyScreenshot.id, screenshotId)))
    .returning()
  if (row) await requireStorage(ctx).delete(row.storageKey)
}
