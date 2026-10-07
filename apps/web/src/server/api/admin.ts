import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { createMiddleware } from 'hono/factory'
import { z } from 'zod'
import { adminOverview, deleteUser, planIds, setWorkspacePlan } from '@wortwerk/core'
import { isAdminUser } from '../admin-access.ts'
import { db, storage } from '../services.ts'
import { requireSession, type Env } from './context.ts'
import { validate } from './validate.ts'

const requireAdmin = createMiddleware<Env>(async (c, next) => {
  if (!isAdminUser(c.get('session').user)) throw new HTTPException(403, { message: 'Admins only' })
  await next()
})

export const admin = new Hono<Env>()
  .use(requireSession, requireAdmin)
  .get('/overview', async (c) => c.json(await adminOverview(db)))
  .put('/workspaces/:id/plan', validate('json', z.object({ plan: z.enum(planIds) })), async (c) => {
    await setWorkspacePlan(db, c.req.param('id'), c.req.valid('json').plan)
    return c.body(null, 204)
  })
  .delete('/users/:id', async (c) => {
    await deleteUser(db, storage, c.req.param('id'), c.get('session').user.id)
    return c.body(null, 204)
  })
