import { and, count, eq, isNull } from 'drizzle-orm'
import { schema } from '@wortwerk/db'
import { DomainError, type Ctx } from './context.ts'
import { getPlan } from './plans.ts'

export async function getTenantPlan(ctx: Ctx) {
  const [row] = await ctx.db
    .select({ plan: schema.tenant.plan })
    .from(schema.tenant)
    .where(eq(schema.tenant.id, ctx.tenantId))
  return getPlan(row?.plan)
}

export async function countActiveKeys(ctx: Ctx) {
  const [row] = await ctx.db
    .select({ n: count() })
    .from(schema.translationKey)
    .where(and(eq(schema.translationKey.tenantId, ctx.tenantId), isNull(schema.translationKey.obsoleteAt)))
  return row?.n ?? 0
}

export async function countProjects(ctx: Ctx) {
  const [row] = await ctx.db
    .select({ n: count() })
    .from(schema.project)
    .where(eq(schema.project.tenantId, ctx.tenantId))
  return row?.n ?? 0
}

export async function assertProjectCapacity(ctx: Ctx) {
  const plan = await getTenantPlan(ctx)
  if (plan.maxProjects === null) return
  if ((await countProjects(ctx)) >= plan.maxProjects) {
    throw new DomainError(
      'limit_reached',
      `The ${plan.id} plan allows ${plan.maxProjects} ${plan.maxProjects === 1 ? 'project' : 'projects'}`,
    )
  }
}

export async function assertKeyCapacity(ctx: Ctx, additional: number) {
  if (additional <= 0) return
  const plan = await getTenantPlan(ctx)
  const used = await countActiveKeys(ctx)
  if (used + additional > plan.maxKeys) {
    throw new DomainError(
      'limit_reached',
      `The ${plan.id} plan allows ${plan.maxKeys} keys (${used} in use, ${additional} requested)`,
    )
  }
}

export async function assertMachineTranslation(ctx: Ctx) {
  const plan = await getTenantPlan(ctx)
  if (!plan.machineTranslation) {
    throw new DomainError('limit_reached', `Machine translation is not available on the ${plan.id} plan`)
  }
}
