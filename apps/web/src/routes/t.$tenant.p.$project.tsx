import { createFileRoute, Link, Outlet } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { PageHeader } from '#/components/app/page.tsx'
import { Badge } from '#/components/ui/badge.tsx'
import { Skeleton } from '#/components/ui/skeleton.tsx'
import { queries } from '#/lib/queries.ts'
import { m } from '#/paraglide/messages.js'

export const Route = createFileRoute('/t/$tenant/p/$project')({
  component: ProjectLayout,
})

function ProjectLayout() {
  const { tenant, project } = Route.useParams()
  const details = useQuery(queries.project(tenant, project))
  const tabs = [
    { to: '/t/$tenant/p/$project', label: m.project_tab_overview(), exact: true },
    { to: '/t/$tenant/p/$project/editor', label: m.project_tab_editor() },
    { to: '/t/$tenant/p/$project/files', label: m.project_tab_files() },
    { to: '/t/$tenant/p/$project/settings', label: m.project_tab_settings() },
  ] as const

  return (
    <div className="flex min-h-dvh flex-col">
      <PageHeader
        title={details.data?.name ?? <Skeleton className="h-7 w-40" />}
        description={
          details.data && (
            <span className="flex flex-wrap items-center gap-1.5">
              {m.project_source_locale()} <Badge className="font-mono">{details.data.sourceLocale}</Badge>
            </span>
          )
        }
      >
        <nav className="-mb-px flex gap-4 overflow-x-auto">
          {tabs.map((tab) => (
            <Link
              key={tab.to}
              to={tab.to}
              params={{ tenant, project }}
              activeOptions={{ exact: 'exact' in tab, includeSearch: false }}
              className="text-muted-foreground hover:text-foreground border-b-2 border-transparent pb-2.5 text-sm whitespace-nowrap"
              activeProps={{ className: 'border-primary! text-foreground font-medium' }}
            >
              {tab.label}
            </Link>
          ))}
        </nav>
      </PageHeader>
      <Outlet />
    </div>
  )
}
