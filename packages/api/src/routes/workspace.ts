import { count, eq } from 'drizzle-orm'
import { countActiveKeys, countProjects, getPlan, type Ctx } from '@wortwerk/core'
import { schema } from '@wortwerk/db'
import { db, translator } from '../services.ts'

export async function workspaceSummary(ctx: Ctx, plan: string) {
  const [members] = await db
    .select({ n: count() })
    .from(schema.member)
    .where(eq(schema.member.organizationId, ctx.tenantId))
  return {
    plan: getPlan(plan),
    features: { machineTranslation: getPlan(plan).machineTranslation && Boolean(translator) },
    usage: {
      projects: await countProjects(ctx),
      keys: await countActiveKeys(ctx),
      members: members?.n ?? 0,
    },
  }
}
