export const planIds = ['free', 'agency'] as const
export type PlanId = (typeof planIds)[number]

export type Plan = {
  id: PlanId
  maxKeys: number
  maxMembers: number | null
  machineTranslation: boolean
  priceChfPerYear: number
}

export const plans: Record<PlanId, Plan> = {
  free: { id: 'free', maxKeys: 5_000, maxMembers: 1, machineTranslation: false, priceChfPerYear: 0 },
  agency: { id: 'agency', maxKeys: 500_000, maxMembers: 10, machineTranslation: true, priceChfPerYear: 500 },
}

export function getPlan(id: string | null | undefined): Plan {
  return plans[(planIds as readonly string[]).includes(id ?? '') ? (id as PlanId) : 'free']
}
