import { createFileRoute, notFound, Outlet, redirect } from '@tanstack/react-router'
import { AppShell } from '#/components/app/app-shell.tsx'
import { getViewer } from '#/lib/viewer.ts'

export const Route = createFileRoute('/t/$tenant')({
  beforeLoad: async ({ params, location }) => {
    const viewer = await getViewer()
    if (!viewer) throw redirect({ to: '/sign-in', search: { redirect: location.href } })
    const tenant = viewer.tenants.find((t) => t.slug === params.tenant)
    if (!tenant) throw notFound()
    return { viewer, tenant }
  },
  component: TenantLayout,
})

function TenantLayout() {
  const { viewer, tenant } = Route.useRouteContext()
  return (
    <AppShell viewer={viewer} tenant={tenant}>
      <Outlet />
    </AppShell>
  )
}
