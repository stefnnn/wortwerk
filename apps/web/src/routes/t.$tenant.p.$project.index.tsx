import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Languages } from 'lucide-react'
import { PageBody } from '#/components/app/page.tsx'
import { ProgressBar } from '#/components/app/status.tsx'
import { Badge } from '#/components/ui/badge.tsx'
import { buttonVariants } from '#/components/ui/button.tsx'
import { Skeleton } from '#/components/ui/skeleton.tsx'
import { formatNumber, localeName, percent } from '#/lib/format.ts'
import { queries } from '#/lib/queries.ts'
import { m } from '#/paraglide/messages.js'

export const Route = createFileRoute('/t/$tenant/p/$project/')({
  component: ProjectOverview,
})

function ProjectOverview() {
  const { tenant, project } = Route.useParams()
  const details = useQuery(queries.project(tenant, project))
  const stats = useQuery(queries.stats(tenant, project))

  if (!stats.data || !details.data) {
    return (
      <PageBody className="grid gap-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </PageBody>
    )
  }

  const total = stats.data[0]?.total ?? 0
  return (
    <PageBody className="grid max-w-5xl gap-6">
      <p className="text-muted-foreground text-sm">{m.overview_keys({ count: formatNumber(total) })}</p>
      <div className="grid gap-3">
        {stats.data.map((s) => {
          const isSource = s.locale === details.data.sourceLocale
          const done = s.translated + s.approved
          return (
            <div
              key={s.locale}
              className="bg-card flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border p-4"
            >
              <div className="w-44 min-w-0">
                <p className="truncate font-medium">{localeName(s.locale)}</p>
                <p className="text-muted-foreground font-mono text-xs">
                  {s.locale} {isSource && <Badge className="ml-1 text-[10px]">{m.project_source()}</Badge>}
                </p>
              </div>
              <div className="min-w-48 flex-1">
                <ProgressBar
                  total={s.total}
                  translated={s.translated}
                  needsReview={s.needsReview}
                  approved={s.approved}
                />
                <p className="text-muted-foreground mt-2 flex flex-wrap gap-x-4 text-xs tabular-nums">
                  <span>{m.overview_done({ percent: percent(done, s.total) })}</span>
                  <span>{m.overview_needs_review({ count: formatNumber(s.needsReview) })}</span>
                  <span>{m.overview_untranslated({ count: formatNumber(s.untranslated) })}</span>
                </p>
              </div>
              {!isSource && (
                <Link
                  to="/t/$tenant/p/$project/editor"
                  params={{ tenant, project }}
                  search={{ locale: s.locale }}
                  className={buttonVariants({ variant: 'outline', size: 'sm' })}
                >
                  <Languages /> {m.overview_translate()}
                </Link>
              )}
            </div>
          )
        })}
      </div>
    </PageBody>
  )
}
