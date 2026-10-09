import { createFileRoute, Link, redirect, useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery } from '@tanstack/react-query'
import { CircleCheck, GitBranch, Terminal } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { z } from 'zod'
import { AuthLayout } from '#/components/auth-layout.tsx'
import { Button, buttonVariants } from '#/components/ui/button.tsx'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#/components/ui/card.tsx'
import { Field, FieldError, FieldGroup, FieldLabel } from '#/components/ui/field.tsx'
import { Input } from '#/components/ui/input.tsx'
import { NativeSelect } from '#/components/ui/native-select.tsx'
import { Textarea } from '#/components/ui/textarea.tsx'
import { client, unwrap } from '#/lib/api.ts'
import { slugify } from '#/lib/format.ts'
import { queries } from '#/lib/queries.ts'
import { getViewer } from '#/lib/viewer.ts'
import { m } from '#/paraglide/messages.js'

export const Route = createFileRoute('/cli/setup')({
  validateSearch: z.object({
    code: z.string().max(20),
    connect: z.string().optional().catch(undefined),
  }),
  beforeLoad: async ({ location }) => {
    const viewer = await getViewer()
    if (!viewer) throw redirect({ to: '/sign-in', search: { redirect: location.href } })
    return { viewer }
  },
  component: CliSetup,
})

const format = (path: string) => {
  const ext = path.split('.').pop()?.toLowerCase()
  if (ext === 'json') return 'json' as const
  if (ext === 'yml' || ext === 'yaml') return 'yaml' as const
  if (ext === 'po' || ext === 'pot') return 'po' as const
  return 'script' as const
}

function CliSetup() {
  const { code } = Route.useSearch()
  const { viewer } = Route.useRouteContext()
  const setup = useQuery({
    queryKey: ['cli-setup', code],
    queryFn: () => unwrap(client.api.account.setup[':code'].$get({ param: { code } })),
  })
  const claim = useMutation({
    mutationFn: () => unwrap(client.api.account.setup[':code'].claim.$post({ param: { code } })),
    onSuccess: (data) => setup.refetch().then(() => data),
  })
  const deny = useMutation({
    mutationFn: () => unwrap(client.api.account.setup[':code'].deny.$post({ param: { code } })),
  })

  if (deny.isSuccess)
    return (
      <AuthLayout title={m.device_denied_title()} description={m.device_denied_body()}>
        <span />
      </AuthLayout>
    )
  if (setup.isPending) return <AuthLayout title={m.cli_setup_title()}>{m.loading()}</AuthLayout>
  if (setup.error)
    return (
      <AuthLayout title={m.cli_setup_title()}>
        <FieldError>{setup.error.message}</FieldError>
      </AuthLayout>
    )
  if (setup.data.status === 'completed') return <Done />
  if (setup.data.status === 'pending') {
    return (
      <AuthLayout title={m.cli_setup_confirm_title()} description={m.cli_setup_confirm_body()}>
        <div className="grid gap-6">
          <div className="flex items-center gap-3 rounded-lg border px-4 py-3">
            <Terminal className="text-muted-foreground size-5" />
            <div>
              <p className="text-sm font-medium">{setup.data.clientName}</p>
              <p className="text-muted-foreground font-mono text-sm">{setup.data.userCode}</p>
            </div>
          </div>
          {(claim.error || deny.error) && <FieldError>{(claim.error ?? deny.error)!.message}</FieldError>}
          <Button size="lg" onClick={() => claim.mutate()} disabled={claim.isPending}>
            {m.cli_setup_confirm_action()}
          </Button>
          <Button size="lg" variant="ghost" onClick={() => deny.mutate()} disabled={deny.isPending}>
            {m.action_cancel()}
          </Button>
        </div>
      </AuthLayout>
    )
  }

  const workspaces = viewer.tenants.filter((tenant) => tenant.role !== 'guest')
  if (!workspaces.length) {
    return (
      <AuthLayout title={m.cli_setup_workspace_title()} description={m.cli_setup_workspace_body()}>
        <Link
          to="/onboarding"
          search={{ redirect: `/cli/setup?code=${encodeURIComponent(code)}` }}
          className={buttonVariants({ size: 'lg' })}
        >
          {m.onboarding_submit()}
        </Link>
      </AuthLayout>
    )
  }
  return <SetupForm code={code} setup={setup.data} workspaces={workspaces} />
}

function SetupForm({
  code,
  setup,
  workspaces,
}: {
  code: string
  setup: any
  workspaces: Array<{ id: string; name: string; slug: string }>
}) {
  const proposal = setup.proposal
  const navigate = useNavigate()
  const connectedWorkspace = workspaces.find((workspace) => workspace.id === setup.tenantId)
  const [tenant, setTenant] = useState(connectedWorkspace?.slug ?? workspaces[0]!.slug)
  const [name, setName] = useState(proposal.name)
  const [slug, setSlug] = useState(slugify(proposal.name))
  const [sourceLocale, setSourceLocale] = useState(proposal.sourceLocale ?? proposal.locales[0] ?? 'en')
  const [locales, setLocales] = useState(proposal.locales.join(', '))
  const [paths, setPaths] = useState(proposal.patterns.map((item: { path: string }) => item.path).join('\n'))
  const [aliases, setAliases] = useState(
    Object.entries(proposal.localeAliases)
      .map(([locale, alias]) => `${locale}=${alias}`)
      .join('\n'),
  )
  const [connectRepo, setConnectRepo] = useState(Boolean(proposal.git))
  const connections = useQuery({ ...queries.gitConnections(tenant), enabled: Boolean(tenant) })
  const matchingConnections =
    connections.data?.connections.filter((item) => item.provider === proposal.git?.provider) ?? []
  const [connectionId, setConnectionId] = useState(setup.connectionId ?? '')
  const effectiveConnectionId = connectionId || setup.connectionId || matchingConnections[0]?.id || ''
  const repos = useQuery({
    ...queries.gitRepos(tenant, effectiveConnectionId),
    enabled: Boolean(tenant && effectiveConnectionId),
  })
  const selectedRepo = repos.data?.find((repo) => repo.fullName === proposal.git?.repo)
  const [repo, setRepo] = useState(proposal.git?.repo ?? '')
  const [branch, setBranch] = useState(proposal.git?.branch ?? '')
  const effectiveBranch = branch || selectedRepo?.defaultBranch || ''

  const parsedAliases = useMemo(
    () =>
      Object.fromEntries(
        aliases
          .split('\n')
          .map((line: string) => line.split('=').map((part) => part.trim()))
          .filter((pair: string[]) => pair.length === 2 && pair[0] && pair[1]),
      ),
    [aliases],
  )
  const complete = useMutation({
    mutationFn: () =>
      unwrap(
        client.api.account.setup[':code'].complete.$post({
          param: { code },
          json: {
            tenant,
            project: {
              name,
              slug,
              sourceLocale,
              locales: locales.split(/[\s,]+/).filter(Boolean),
            },
            files: paths
              .split('\n')
              .map((path: string) => path.trim())
              .filter(Boolean)
              .map((path: string) => ({ path, format: format(path) })),
            ...(connectRepo
              ? {
                  repo: {
                    connectionId: effectiveConnectionId,
                    repo,
                    branch: effectiveBranch,
                    exportBranch: 'wortwerk/translations',
                    localeAliases: parsedAliases,
                    autoExport: true,
                  },
                }
              : {}),
          },
        }),
      ),
    onSuccess: () => navigate({ to: '/cli/setup', search: { code } }),
  })
  const submit = (event: FormEvent) => {
    event.preventDefault()
    complete.mutate()
  }

  return (
    <AuthLayout title={m.cli_setup_project_title()} description={m.cli_setup_project_body()}>
      <form onSubmit={submit} className="grid gap-6">
        <FieldGroup>
          <Field>
            <FieldLabel>{m.field_workspace_name()}</FieldLabel>
            <NativeSelect
              value={tenant}
              disabled={Boolean(connectedWorkspace)}
              onChange={(event) => {
                setTenant(event.target.value)
                setConnectionId('')
              }}
            >
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.slug}>
                  {workspace.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel>{m.field_name()}</FieldLabel>
            <Input value={name} onChange={(event) => setName(event.target.value)} required />
          </Field>
          <Field>
            <FieldLabel>{m.field_slug()}</FieldLabel>
            <Input value={slug} onChange={(event) => setSlug(event.target.value)} required />
          </Field>
          <Field>
            <FieldLabel>{m.field_source_locale()}</FieldLabel>
            <Input value={sourceLocale} onChange={(event) => setSourceLocale(event.target.value)} required />
          </Field>
          <Field>
            <FieldLabel>{m.cli_setup_locales()}</FieldLabel>
            <Input value={locales} onChange={(event) => setLocales(event.target.value)} required />
          </Field>
          <Field>
            <FieldLabel>{m.cli_setup_files()}</FieldLabel>
            <Textarea value={paths} onChange={(event) => setPaths(event.target.value)} required rows={4} />
          </Field>
          <Field>
            <FieldLabel>{m.cli_setup_aliases()}</FieldLabel>
            <Textarea value={aliases} onChange={(event) => setAliases(event.target.value)} rows={3} />
          </Field>
        </FieldGroup>

        {proposal.git && (
          <Card>
            <CardHeader>
              <GitBranch />
              <CardTitle>{m.setup_repo_title()}</CardTitle>
              <CardDescription>{proposal.git.repo}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={connectRepo}
                  onChange={(event) => setConnectRepo(event.target.checked)}
                />
                {m.cli_setup_connect_repo()}
              </label>
              {connectRepo && !effectiveConnectionId && (
                <a
                  href={`/api/t/${tenant}/git/connect/${proposal.git.provider}?setup=${encodeURIComponent(code)}`}
                  className={buttonVariants()}
                >
                  {m.git_connect({ provider: proposal.git.provider === 'github' ? 'GitHub' : 'Bitbucket' })}
                </a>
              )}
              {connectRepo && effectiveConnectionId && (
                <>
                  <NativeSelect
                    value={effectiveConnectionId}
                    onChange={(event) => setConnectionId(event.target.value)}
                  >
                    {matchingConnections.map((connection) => (
                      <option key={connection.id} value={connection.id}>
                        {connection.accountName}
                      </option>
                    ))}
                  </NativeSelect>
                  <NativeSelect value={repo} onChange={(event) => setRepo(event.target.value)} required>
                    <option value="">{m.cli_setup_select_repo()}</option>
                    {repos.data?.map((item) => (
                      <option key={item.fullName} value={item.fullName}>
                        {item.fullName}
                      </option>
                    ))}
                  </NativeSelect>
                  <Input
                    value={effectiveBranch}
                    onChange={(event) => setBranch(event.target.value)}
                    required
                  />
                  <a
                    href={`/api/t/${tenant}/git/connect/${proposal.git.provider}?setup=${encodeURIComponent(code)}`}
                    className={buttonVariants({ variant: 'outline' })}
                  >
                    {m.git_connect({
                      provider: proposal.git.provider === 'github' ? 'GitHub' : 'Bitbucket',
                    })}
                  </a>
                </>
              )}
            </CardContent>
          </Card>
        )}
        {complete.error && <FieldError>{complete.error.message}</FieldError>}
        <Button
          type="submit"
          size="lg"
          disabled={complete.isPending || (connectRepo && !effectiveConnectionId)}
        >
          {m.cli_setup_create()}
        </Button>
      </form>
    </AuthLayout>
  )
}

function Done() {
  return (
    <AuthLayout title={m.cli_setup_done_title()} description={m.cli_setup_done_body()}>
      <CircleCheck className="text-primary size-12" />
    </AuthLayout>
  )
}
