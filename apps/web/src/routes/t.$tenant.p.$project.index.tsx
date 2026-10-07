import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FileUp, GitMerge, GitPullRequestArrow, Languages, Sparkles } from 'lucide-react'
import { useEffect } from 'react'
import { EmptyState, PageBody } from '#/components/app/page.tsx'
import { ProgressBar } from '#/components/app/status.tsx'
import { Badge } from '#/components/ui/badge.tsx'
import { Button, buttonVariants } from '#/components/ui/button.tsx'
import { Skeleton } from '#/components/ui/skeleton.tsx'
import { formatNumber, localeName, percent } from '#/lib/format.ts'
import { t, unwrap } from '#/lib/api.ts'
import { useAction } from '#/lib/mutations.ts'
import { queries } from '#/lib/queries.ts'
import { m } from '#/paraglide/messages.js'

export const Route = createFileRoute('/t/$tenant/p/$project/')({
  component: ProjectOverview,
})

function ProjectOverview() {
  const { tenant, project } = Route.useParams()
  const details = useQuery(queries.project(tenant, project))
  const stats = useQuery(queries.stats(tenant, project))
  const tenantInfo = useQuery(queries.tenant(tenant))
  const runs = useQuery(queries.runs(tenant, project))
  const sourceSync = useQuery(queries.sourceSync(tenant, project))
  const queryClient = useQueryClient()
  const machineRunning = runs.data?.some(
    (r) => r.kind === 'machine' && (r.status === 'queued' || r.status === 'running'),
  )
  useEffect(() => {
    if (machineRunning === false)
      void queryClient.invalidateQueries({ queryKey: queries.stats(tenant, project).queryKey })
  }, [machineRunning, queryClient, tenant, project])

  const pretranslate = useAction(
    (locale: string) =>
      unwrap(t.projects[':project'].machine.$post({ param: { tenant, project }, json: { locale } })),
    { invalidate: [queries.runs(tenant, project).queryKey], success: m.machine_queued() },
  )
  const canMachine = tenantInfo.data?.features.machineTranslation ?? false

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
  if (!details.data.files.length) {
    return (
      <PageBody className="max-w-5xl">
        <EmptyState
          icon={<FileUp />}
          title={m.setup_title()}
          body={m.setup_body()}
          action={
            <Link to="/t/$tenant/p/$project/setup" params={{ tenant, project }} className={buttonVariants()}>
              {m.setup_continue()}
            </Link>
          }
        />
      </PageBody>
    )
  }
  return (
    <PageBody className="grid max-w-5xl gap-6">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <p className="text-muted-foreground">{m.overview_keys({ count: formatNumber(total) })}</p>
        {!!sourceSync.data?.conflicts && (
          <Link
            to="/t/$tenant/p/$project/editor"
            params={{ tenant, project }}
            search={{ locale: details.data.sourceLocale, sync: 'conflict' }}
            className="text-warning flex items-center gap-1.5 hover:underline"
          >
            <GitMerge className="size-4" />
            {m.overview_source_conflicts({ count: formatNumber(sourceSync.data.conflicts) })}
          </Link>
        )}
        {!!sourceSync.data?.pending && (
          <Link
            to="/t/$tenant/p/$project/editor"
            params={{ tenant, project }}
            search={{ locale: details.data.sourceLocale, sync: 'pending' }}
            className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 hover:underline"
          >
            <GitPullRequestArrow className="size-4" />
            {m.overview_source_pending({ count: formatNumber(sourceSync.data.pending) })}
          </Link>
        )}
      </div>
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
              {!isSource && canMachine && s.untranslated > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={pretranslate.isPending || machineRunning}
                  onClick={() => pretranslate.mutate(s.locale)}
                >
                  <Sparkles className={machineRunning ? 'animate-pulse' : undefined} />{' '}
                  {m.machine_pretranslate()}
                </Button>
              )}
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
