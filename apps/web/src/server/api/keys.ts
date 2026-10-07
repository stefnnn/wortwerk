import { Hono } from 'hono'
import { validate } from './validate.ts'
import { z } from 'zod'
import {
  addComment,
  addScreenshot,
  commentInput,
  createKey,
  bulkStatuses,
  createKeyInput,
  splitSelection,
  setTranslationStatusBulk,
  deleteComment,
  deleteScreenshot,
  keepRepoVersion,
  listComments,
  listOpenConflicts,
  listKeys,
  listKeysInput,
  listRevisions,
  listScreenshots,
  purgeObsoleteKeys,
  readScreenshot,
  setKeysObsolete,
  setTranslation,
  setTranslationInput,
  suggestMachineTranslation,
  DomainError,
  tmSuggestions,
  updateKey,
  updateKeyInput,
} from '@wortwerk/core'
import { requireProject, type Env } from './context.ts'
import { translator } from '../services.ts'

const locale = z.object({ locale: z.string() })

export const projectKeys = new Hono<Env>()
  .use(requireProject)
  .get('/', validate('query', listKeysInput), async (c) =>
    c.json(await listKeys(c.get('ctx'), c.get('project').id, c.req.valid('query'))),
  )
  .post('/', validate('json', createKeyInput), async (c) =>
    c.json(await createKey(c.get('ctx'), c.get('project').id, c.req.valid('json')), 201),
  )
  .post(
    '/obsolete',
    validate('json', z.object({ keyIds: z.array(z.string()).max(1000), obsolete: z.boolean() })),
    async (c) => {
      const { keyIds, obsolete } = c.req.valid('json')
      await setKeysObsolete(c.get('ctx'), keyIds, obsolete)
      return c.body(null, 204)
    },
  )
  .post(
    '/status',
    validate(
      'json',
      z.object({
        locale: z.string(),
        status: z.enum(bulkStatuses),
        selection: z.record(z.string(), z.unknown()),
      }),
    ),
    async (c) => {
      const body = c.req.valid('json')
      const ctx = c.get('ctx')
      const projectId = c.get('project').id
      const total = { selected: 0, updated: 0 }
      for (const part of await splitSelection(ctx, projectId, body.locale, body.selection)) {
        const result = await setTranslationStatusBulk(
          ctx,
          projectId,
          part.locale,
          body.status,
          part.selection,
        )
        total.selected += result.selected
        total.updated += result.updated
      }
      return c.json(total)
    },
  )
  .post('/purge', async (c) =>
    c.json({ deleted: await purgeObsoleteKeys(c.get('ctx'), c.get('project').id) }),
  )

export const keys = new Hono<Env>()
  .patch('/:keyId', validate('json', updateKeyInput), async (c) =>
    c.json(await updateKey(c.get('ctx'), c.req.param('keyId'), c.req.valid('json'))),
  )
  .put('/:keyId/translations/:locale', validate('json', setTranslationInput), async (c) =>
    c.json(
      await setTranslation(c.get('ctx'), c.req.param('keyId'), c.req.param('locale'), c.req.valid('json')),
    ),
  )
  .get('/:keyId/translations/:locale/revisions', async (c) =>
    c.json(await listRevisions(c.get('ctx'), c.req.param('keyId'), c.req.param('locale'))),
  )
  .get('/:keyId/suggestions', validate('query', locale), async (c) =>
    c.json(await tmSuggestions(c.get('ctx'), c.req.param('keyId'), c.req.valid('query').locale)),
  )
  .post('/:keyId/machine', validate('json', locale), async (c) => {
    if (!translator) throw new DomainError('invalid', 'Machine translation is not configured')
    return c.json(
      await suggestMachineTranslation(
        c.get('ctx'),
        translator,
        c.req.param('keyId'),
        c.req.valid('json').locale,
      ),
    )
  })
  .get('/:keyId/conflicts', async (c) => c.json(await listOpenConflicts(c.get('ctx'), c.req.param('keyId'))))
  .post('/:keyId/conflicts/keep-repo', async (c) => {
    await keepRepoVersion(c.get('ctx'), c.req.param('keyId'))
    return c.body(null, 204)
  })
  .get('/:keyId/comments', async (c) => c.json(await listComments(c.get('ctx'), c.req.param('keyId'))))
  .post('/:keyId/comments', validate('json', commentInput), async (c) =>
    c.json(await addComment(c.get('ctx'), c.req.param('keyId'), c.req.valid('json')), 201),
  )
  .get('/:keyId/screenshots', async (c) => c.json(await listScreenshots(c.get('ctx'), c.req.param('keyId'))))
  .post('/:keyId/screenshots', validate('form', z.object({ file: z.instanceof(File) })), async (c) => {
    const { file } = c.req.valid('form')
    const row = await addScreenshot(c.get('ctx'), c.req.param('keyId'), {
      name: file.name,
      type: file.type,
      bytes: new Uint8Array(await file.arrayBuffer()),
    })
    return c.json(row, 201)
  })

export const comments = new Hono<Env>().delete('/:commentId', async (c) => {
  await deleteComment(c.get('ctx'), c.req.param('commentId'))
  return c.body(null, 204)
})

export const screenshots = new Hono<Env>()
  .get('/:screenshotId', async (c) => {
    const shot = await readScreenshot(c.get('ctx'), c.req.param('screenshotId'))
    return c.body(shot.bytes, 200, {
      'content-type': shot.mimeType,
      'cache-control': 'private, max-age=3600',
      'x-content-type-options': 'nosniff',
    })
  })
  .delete('/:screenshotId', async (c) => {
    await deleteScreenshot(c.get('ctx'), c.req.param('screenshotId'))
    return c.body(null, 204)
  })
