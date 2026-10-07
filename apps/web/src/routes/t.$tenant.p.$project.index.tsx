import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, FileUp, GitMerge, GitPullRequestArrow, Upload, WandSparkles } from 'lucide-react'
import { useEffect } from 'react'
import { EmptyState, PageBody } from '#/components/app/page.tsx'
import { ProgressBar } from '#/components/app/status.tsx'
import { Badge } from '#/components/ui/badge.tsx'
import { Button, buttonVariants } from '#/components/ui/button.tsx'
import { Skeleton } from '#/components/ui/skeleton.tsx'
import { Tooltip, TooltipContent, TooltipTrigger } from '#/components/ui/tooltip.tsx'
import { formatDateTime, formatNumber, localeName, percent } from '#/lib/format.ts'
import { t, unwrap } from '#/lib/api.ts'
import { useAction } from '#/lib/mutations.ts'
import { queries } from '#/lib/queries.ts'
import { m } from '#/paraglide/messages.js'

export const Route = createFileRoute('/t/$tenant/p/$project/')({
  component: ProjectOverview,
})

function ProjectOverview() {
  const { tenant, project } = Route.useParams()
  // runs, repo and source sync are workspace business: guests only see progress
  const guest = Route.useRouteContext().tenant.role === 'guest'
  const details = useQuery(queries.project(tenant, project))
  const tenantInfo = useQuery(queries.tenant(tenant))
  // while machine translation runs, progress is polled
  const runs = useQuery({
    ...queries.runs(tenant, project),
    enabled: !guest,
    refetchInterval: (q) =>
      q.state.data?.some((r) => r.kind === 'machine' && (r.status === 'queued' || r.status === 'running'))
        ? 5000
        : false,
  })
  const sourceSync = useQuery({ ...queries.sourceSync(tenant, project), enabled: !guest })
  // a merged pull request arrives via webhook and pull job, so an unsynced status is polled
  const repo = useQuery({
    ...queries.repo(tenant, project),
    enabled: !guest,
    refetchInterval: (q) =>
      q.state.data?.exportState && q.state.data.exportState !== 'synced' ? 10_000 : false,
  })
  const queryClient = useQueryClient()
  const activeMachine = runs.data?.filter(
    (r) => r.kind === 'machine' && (r.status === 'queued' || r.status === 'running'),
  )
  const machineRunning = activeMachine && activeMachine.length > 0
  const stats = useQuery({
    ...queries.stats(tenant, project),
    refetchInterval: machineRunning ? 5000 : false,
  })
  useEffect(() => {
    if (machineRunning === false)
      void queryClient.invalidateQueries({ queryKey: queries.stats(tenant, project).queryKey })
  }, [machineRunning, queryClient, tenant, project])

  const pretranslate = useAction(
    (locale: string) =>
      unwrap(t.projects[':project'].machine.$post({ param: { tenant, project }, json: { locale } })),
    { invalidate: [queries.runs(tenant, project).queryKey], success: m.machine_queued() },
  )
  // one locale can be queued while others are still running, so busy is tracked per locale
  // a run that has been going for a long time is probably dead: allow starting again
  const isTranslating = (locale: string) =>
    (pretranslate.isPending && pretranslate.variables === locale) ||
    !!activeMachine?.some(
      (r) =>
        (r.params as { locale?: string }).locale === locale &&
        Date.now() - new Date(r.startedAt ?? r.createdAt).getTime() < 10 * 60_000,
    )
  // pre-translating a whole language is a bulk job: members only
  const canMachine = (tenantInfo.data?.features.machineTranslation ?? false) && !guest

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
  const locales = [...stats.data].sort(
    (a, b) => Number(b.locale === details.data.sourceLocale) - Number(a.locale === details.data.sourceLocale),
  )
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
      {repo.data?.exportState && <ExportStatus repo={repo.data} state={repo.data.exportState} />}
      <div className="grid gap-3">
        {locales.map((s) => {
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
                  <StatusLink
                    tenant={tenant}
                    project={project}
                    locale={s.locale}
                    status="needs_review"
                    count={s.needsReview}
                  >
                    {m.overview_needs_review({ count: formatNumber(s.needsReview) })}
                  </StatusLink>
                  <StatusLink
                    tenant={tenant}
                    project={project}
                    locale={s.locale}
                    status="untranslated"
                    count={s.untranslated}
                  >
                    {m.overview_untranslated({ count: formatNumber(s.untranslated) })}
                  </StatusLink>
                </p>
              </div>
              {!isSource && canMachine && s.untranslated > 0 && (
                <Tooltip>
                  <TooltipTrigger render={<span />}>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={isTranslating(s.locale)}
                      onClick={() => pretranslate.mutate(s.locale)}
                    >
                      <WandSparkles className={isTranslating(s.locale) ? 'animate-pulse' : undefined} />{' '}
                      {m.machine_pretranslate()}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {m.machine_translated_count({ done: formatNumber(done), total: formatNumber(s.total) })}
                  </TooltipContent>
                </Tooltip>
              )}
              <Link
                to="/t/$tenant/p/$project/editor"
                params={{ tenant, project }}
                search={{ locale: s.locale }}
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
              >
                {m.overview_open()}
              </Link>
            </div>
          )
        })}
      </div>
    </PageBody>
  )
}

function StatusLink({
  tenant,
  project,
  locale,
  status,
  count,
  children,
}: {
  tenant: string
  project: string
  locale: string
  status: 'untranslated' | 'needs_review'
  count: number
  children: React.ReactNode
}) {
  if (!count) return <span>{children}</span>
  return (
    <Link
      to="/t/$tenant/p/$project/editor"
      params={{ tenant, project }}
      search={{ locale, status }}
      className="hover:text-foreground underline underline-offset-2"
    >
      {children}
    </Link>
  )
}

function ExportStatus({
  repo,
  state,
}: {
  repo: { lastPushedAt: string | Date | null; pullRequestUrl: string | null }
  state: 'synced' | 'pending' | 'pr'
}) {
  const label = { synced: m.export_synced(), pending: m.export_pending(), pr: m.export_pr_open() }[state]
  const content = (
    <>
      {state === 'synced' ? <Check className="text-success size-4" /> : <Upload className="size-4" />}
      {label}
    </>
  )
  const className = 'flex items-center gap-1.5 text-sm'
  return (
    <div className="-mb-3 flex justify-end">
      <Tooltip>
        <TooltipTrigger
          render={
            state === 'pr' && repo.pullRequestUrl ? (
              <a
                href={repo.pullRequestUrl}
                target="_blank"
                rel="noreferrer"
                className={`${className} text-primary hover:underline`}
              />
            ) : (
              <span className={`${className} text-muted-foreground`} />
            )
          }
        >
          {content}
        </TooltipTrigger>
        <TooltipContent>
          {repo.lastPushedAt ? m.export_last({ date: formatDateTime(repo.lastPushedAt) }) : m.export_never()}
        </TooltipContent>
      </Tooltip>
    </div>
  )
}
