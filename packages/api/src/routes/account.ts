import { Hono } from 'hono'
import { z } from 'zod'
import {
  apiTokenInput,
  createApiToken,
  decideDeviceAuth,
  getDeviceAuth,
  listApiTokens,
  revokeApiToken,
} from '@wortwerk/core'
import { db } from '../services.ts'
import { requireSession, type Env } from './context.ts'
import { validate } from './validate.ts'

export const account = new Hono<Env>()
  .use(requireSession)
  .get('/tokens', async (c) => c.json(await listApiTokens(db, c.get('session').user.id)))
  .post('/tokens', validate('json', apiTokenInput), async (c) =>
    c.json(await createApiToken(db, c.get('session').user.id, c.req.valid('json')), 201),
  )
  .delete('/tokens/:tokenId', async (c) => {
    await revokeApiToken(db, c.get('session').user.id, c.req.param('tokenId'))
    return c.body(null, 204)
  })
  .get('/device/:code', async (c) => c.json(await getDeviceAuth(db, c.req.param('code'))))
  .post('/device/:code', validate('json', z.object({ approve: z.boolean() })), async (c) => {
    await decideDeviceAuth(db, c.get('session').user.id, c.req.param('code'), c.req.valid('json').approve)
    return c.body(null, 204)
  })
