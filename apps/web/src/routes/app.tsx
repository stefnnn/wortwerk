import { createFileRoute, redirect } from '@tanstack/react-router'
import { getViewer } from '#/lib/viewer.ts'

export const Route = createFileRoute('/app')({
  beforeLoad: async () => {
    const viewer = await getViewer()
    if (!viewer) throw redirect({ to: '/sign-in' })
    const [first] = viewer.tenants
    if (!first) throw redirect({ to: '/onboarding' })
    throw redirect({ to: '/t/$tenant', params: { tenant: first.slug } })
  },
})
