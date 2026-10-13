export const planIds = ['free', 'project', 'agency'] as const
export type PlanId = (typeof planIds)[number]

export type Plan = {
  id: PlanId
  maxProjects: number | null
  maxKeys: number
  maxMembers: number | null
  machineTranslation: boolean
  priceChfPerYear: number
}

export const plans: Record<PlanId, Plan> = {
  free: {
    id: 'free',
    maxProjects: 1,
    maxKeys: 500,
    maxMembers: 1,
    machineTranslation: false,
    priceChfPerYear: 0,
  },
  project: {
    id: 'project',
    maxProjects: 1,
    maxKeys: 5_000,
    maxMembers: 3,
    machineTranslation: true,
    priceChfPerYear: 450,
  },
  agency: {
    id: 'agency',
    maxProjects: null,
    maxKeys: 500_000,
    maxMembers: 10,
    machineTranslation: true,
    priceChfPerYear: 900,
  },
}

export function getPlan(id: string | null | undefined): Plan {
  return plans[(planIds as readonly string[]).includes(id ?? '') ? (id as PlanId) : 'free']
}
