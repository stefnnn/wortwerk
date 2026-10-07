import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { FileUp, GitBranch, Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { z } from 'zod'
import { PageBody } from '#/components/app/page.tsx'
import { RepoCard } from '#/components/app/repo-settings.tsx'
import { ImportCard } from './t.$tenant.p.$project.files.tsx'
import { Alert, AlertDescription } from '#/components/ui/alert.tsx'
import { Button, buttonVariants } from '#/components/ui/button.tsx'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#/components/ui/card.tsx'
import { queries } from '#/lib/queries.ts'
import { m } from '#/paraglide/messages.js'

export const Route = createFileRoute('/t/$tenant/p/$project/setup')({
  // guests only edit content
  beforeLoad: ({ context, params }) => {
    if (context.tenant.role === 'guest') throw redirect({ to: '/t/$tenant/p/$project', params })
  },
  validateSearch: z.object({ connect: z.string().optional() }),
  component: ProjectSetup,
})

function ProjectSetup() {
  const { tenant, project } = Route.useParams()
  const navigate = useNavigate()
  const { connect } = Route.useSearch()
  const details = useQuery(queries.project(tenant, project))
  const link = useQuery(queries.repo(tenant, project))
  const connections = useQuery(queries.gitConnections(tenant))
  const runs = useQuery(queries.runs(tenant, project))
  const [choice, setChoice] = useState<'repo' | 'upload' | null>(null)
  const [uploadRunId, setUploadRunId] = useState<string | null>(null)
  const mode = choice ?? (link.data || connect ? 'repo' : details.data?.files.length ? 'upload' : null)
  const latestPull = runs.data?.find((run) => run.kind === 'pull')
  const uploadRun = runs.data?.find((run) => run.id === uploadRunId)
  const currentRun =
    mode === 'repo' && link.data && details.data?.files.length
      ? latestPull
      : mode === 'upload'
        ? uploadRun
        : undefined

  useEffect(() => {
    if (currentRun?.status === 'succeeded') {
      void navigate({ to: '/t/$tenant/p/$project', params: { tenant, project } })
    }
  }, [currentRun?.status, navigate, project, tenant])

  const locales = details.data?.locales.map((locale) => locale.code) ?? []

  return (
    <PageBody className="grid max-w-3xl gap-6">
      <div>
        <h1 className="text-xl font-semibold">{m.setup_title()}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{m.setup_body()}</p>
      </div>

      {!mode && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <GitBranch className="text-primary size-6" />
              <CardTitle>{m.setup_repo_title()}</CardTitle>
              <CardDescription>{m.setup_repo_body()}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => setChoice('repo')}>{m.setup_repo_action()}</Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <FileUp className="text-primary size-6" />
              <CardTitle>{m.setup_upload_title()}</CardTitle>
              <CardDescription>{m.setup_upload_body()}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" onClick={() => setChoice('upload')}>
                {m.setup_upload_action()}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {mode === 'repo' && (
        <>
          {!link.data && (
            <Card>
              <CardHeader>
                <CardTitle>{m.setup_provider_title()}</CardTitle>
                <CardDescription>{m.setup_provider_body()}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {(['github', 'bitbucket'] as const).map((provider) =>
                  connections.data?.available[provider] ? (
                    <a
                      key={provider}
                      href={`/api/t/${tenant}/git/connect/${provider}?project=${encodeURIComponent(project)}`}
                      className={buttonVariants({ variant: 'outline' })}
                    >
                      {m.git_connect({ provider: provider === 'github' ? 'GitHub' : 'Bitbucket' })}
                    </a>
                  ) : (
                    <Button key={provider} variant="outline" disabled title={m.git_not_configured()}>
                      {m.git_connect({ provider: provider === 'github' ? 'GitHub' : 'Bitbucket' })}
                    </Button>
                  ),
                )}
              </CardContent>
            </Card>
          )}
          {connect === 'requested' && (
            <Alert>
              <AlertDescription>{m.git_requested()}</AlertDescription>
            </Alert>
          )}
          {connect === 'cancelled' && (
            <Alert>
              <AlertDescription>{m.setup_connect_cancelled()}</AlertDescription>
            </Alert>
          )}
          <RepoCard tenant={tenant} project={project} />
          {link.data && details.data?.files.length === 0 && (
            <p className="text-muted-foreground text-sm">{m.setup_pattern_hint()}</p>
          )}
        </>
      )}

      {mode === 'upload' && (
        <ImportCard
          tenant={tenant}
          project={project}
          files={details.data?.files ?? []}
          locales={locales}
          sourceLocale={details.data?.sourceLocale}
          onQueued={setUploadRunId}
        />
      )}

      {currentRun && (
        <Alert>
          {(currentRun.status === 'queued' || currentRun.status === 'running') && (
            <Loader2 className="animate-spin" />
          )}
          <AlertDescription>
            {currentRun.status === 'failed'
              ? m.setup_run_failed({ message: currentRun.error ?? m.error_generic() })
              : currentRun.status === 'succeeded'
                ? m.setup_run_complete()
                : m.setup_run_running()}
          </AlertDescription>
        </Alert>
      )}

      {mode && !link.data && !uploadRunId && (
        <Button
          variant="ghost"
          className="justify-self-start"
          onClick={() => setChoice(mode === 'repo' ? 'upload' : 'repo')}
        >
          {mode === 'repo' ? m.setup_upload_action() : m.setup_repo_action()}
        </Button>
      )}
    </PageBody>
  )
}
