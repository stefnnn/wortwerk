import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Download, FileUp, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { FilePatternForm } from '#/components/app/file-patterns.tsx'
import { PageBody } from '#/components/app/page.tsx'
import { Badge } from '#/components/ui/badge.tsx'
import { Button, buttonVariants } from '#/components/ui/button.tsx'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#/components/ui/card.tsx'
import { Checkbox } from '#/components/ui/checkbox.tsx'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '#/components/ui/field.tsx'
import { Input } from '#/components/ui/input.tsx'
import { NativeSelect } from '#/components/ui/native-select.tsx'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table.tsx'
import { t, unwrap } from '#/lib/api.ts'
import { formatDateTime } from '#/lib/format.ts'
import { useAction } from '#/lib/mutations.ts'
import { queries } from '#/lib/queries.ts'
import { cn } from '#/lib/utils.ts'
import { m } from '#/paraglide/messages.js'

export const Route = createFileRoute('/t/$tenant/p/$project/files')({
  component: ProjectFiles,
})

function ProjectFiles() {
  const { tenant, project } = Route.useParams()
  const details = useQuery(queries.project(tenant, project))
  const runs = useQuery(queries.runs(tenant, project))
  const files = details.data?.files ?? []
  const locales = details.data?.locales.map((l) => l.code) ?? []

  const removeFile = useAction(
    (fileId: string) =>
      unwrap(t.projects[':project'].files[':fileId'].$delete({ param: { tenant, project, fileId } })),
    { invalidate: [queries.project(tenant, project).queryKey] },
  )

  return (
    <PageBody className="grid max-w-5xl gap-6">
      <ImportCard
        tenant={tenant}
        project={project}
        files={files}
        locales={locales}
        sourceLocale={details.data?.sourceLocale}
      />

      <Card>
        <CardHeader>
          <CardTitle>{m.files_title()}</CardTitle>
          <CardDescription>{m.files_subtitle()}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {files.length === 0 ? (
            <p className="text-muted-foreground text-sm">{m.files_empty()}</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {files.map((file) => (
                <li key={file.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <code className="min-w-0 flex-1 truncate text-sm">{file.path}</code>
                  <Badge variant="outline" className="uppercase">
                    {file.format}
                  </Badge>
                  <div className="flex flex-wrap gap-1">
                    {locales.map((locale) => (
                      <a
                        key={locale}
                        href={`/api/t/${tenant}/projects/${project}/files/${file.id}/export?locale=${encodeURIComponent(locale)}`}
                        className={buttonVariants({ variant: 'outline', size: 'xs' })}
                        download
                      >
                        <Download /> {locale}
                      </a>
                    ))}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={m.action_remove()}
                    onClick={() => removeFile.mutate(file.id)}
                  >
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <FilePatternForm tenant={tenant} project={project} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{m.runs_title()}</CardTitle>
        </CardHeader>
        <CardContent>
          {!runs.data?.length ? (
            <p className="text-muted-foreground text-sm">{m.runs_empty()}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{m.runs_file()}</TableHead>
                  <TableHead>{m.runs_status()}</TableHead>
                  <TableHead>{m.runs_result()}</TableHead>
                  <TableHead className="text-right">{m.runs_date()}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.data.map((run) => (
                  <TableRow key={run.id}>
                    <TableCell className="text-xs">
                      <RunLabel kind={run.kind} params={run.params} />
                    </TableCell>
                    <TableCell>
                      <RunStatus status={run.status} />
                    </TableCell>
                    <TableCell className="text-muted-foreground max-w-80 text-xs whitespace-normal">
                      {run.error ? (
                        <span className="text-destructive">{run.error}</span>
                      ) : run.result ? (
                        <RunSummary kind={run.kind} result={run.result} />
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-right text-xs">
                      {formatDateTime(run.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </PageBody>
  )
}

function RunStatus({ status }: { status: string }) {
  const label: Record<string, string> = {
    queued: m.run_queued(),
    running: m.run_running(),
    succeeded: m.run_succeeded(),
    failed: m.run_failed(),
  }
  return (
    <Badge
      variant="secondary"
      className={cn(
        'border-0',
        status === 'succeeded' && 'bg-success-surface text-success',
        status === 'failed' && 'bg-destructive/10 text-destructive',
        (status === 'queued' || status === 'running') && 'animate-pulse',
      )}
    >
      {label[status] ?? status}
    </Badge>
  )
}

function RunLabel({ kind, params }: { kind: string; params: Record<string, unknown> }) {
  const trigger = params.trigger ? String(params.trigger) : ''
  const label: Record<string, string> = {
    import: m.run_kind_import(),
    export: m.run_kind_import(),
    pull: m.run_kind_pull(),
    push: m.run_kind_push(),
    machine: m.run_kind_machine(),
  }
  return (
    <span className="grid gap-0.5">
      <span className="font-medium">{label[kind] ?? kind}</span>
      <span className="text-muted-foreground font-mono">
        {kind === 'import' && `${String(params.filename ?? '')} → ${String(params.locale ?? '')}`}
        {kind === 'machine' && String(params.locale ?? '')}
        {(kind === 'pull' || kind === 'push') && trigger && runTrigger(trigger)}
        {kind === 'pull' && params.importTranslations === true && ` · ${m.run_with_translations()}`}
      </span>
    </span>
  )
}

function runTrigger(trigger: string) {
  const labels: Record<string, () => string> = {
    manual: m.run_trigger_manual,
    webhook: m.run_trigger_webhook,
    ci: m.run_trigger_ci,
    connect: m.run_trigger_connect,
    auto: m.run_trigger_auto,
    pull: m.run_trigger_auto,
  }
  return labels[trigger]?.() ?? trigger
}

type FileResult = {
  keysAdded?: number
  translationsChanged?: number
  keysObsoleted?: number
  skipped?: number
}

function RunSummary({ kind, result }: { kind: string; result: Record<string, unknown> }) {
  if (kind === 'pull') {
    if (result.skipped) return <>{m.run_up_to_date()}</>
    const files = (result.files ?? []) as FileResult[]
    const sum = (key: keyof FileResult) => files.reduce((n, f) => n + Number(f[key] ?? 0), 0)
    return (
      <>
        <code>{String(result.sha ?? '').slice(0, 7)}</code> ·{' '}
        {m.run_summary({
          added: sum('keysAdded'),
          changed: sum('translationsChanged'),
          obsoleted: sum('keysObsoleted'),
          skipped: sum('skipped'),
        })}
      </>
    )
  }
  if (kind === 'push') {
    if (!result.diff) return <>{m.run_nothing_to_export()}</>
    const url = result.pullRequestUrl ? String(result.pullRequestUrl) : null
    return (
      <>
        {result.updated
          ? m.run_exported({ count: ((result.files ?? []) as unknown[]).length })
          : m.run_up_to_date()}
        {url && (
          <>
            {' · '}
            <a href={url} target="_blank" rel="noreferrer" className="text-primary hover:underline">
              {m.repo_pull_request()}
            </a>
          </>
        )}
      </>
    )
  }
  if (kind === 'machine') {
    return (
      <>
        {m.run_machine_summary({
          translated: Number(result.translated ?? 0),
          requested: Number(result.requested ?? 0),
          failed: ((result.failed ?? []) as unknown[]).length,
        })}
      </>
    )
  }
  const n = (key: string) => Number(result[key] ?? 0)
  return (
    <>
      {m.run_summary({
        added: n('keysAdded'),
        changed: n('translationsChanged'),
        obsoleted: n('keysObsoleted'),
        skipped: n('skipped'),
      })}
    </>
  )
}

export function ImportCard({
  tenant,
  project,
  files,
  locales,
  sourceLocale,
  onQueued,
}: {
  tenant: string
  project: string
  files: Array<{ id: string; path: string }>
  locales: string[]
  sourceLocale?: string
  onQueued?: (runId: string) => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [locale, setLocale] = useState('')
  const [target, setTarget] = useState('')
  const [path, setPath] = useState('')
  const [overwrite, setOverwrite] = useState(false)
  const effectiveLocale = locale || sourceLocale || ''

  const upload = useAction(
    () =>
      unwrap(
        t.projects[':project'].imports.$post({
          param: { tenant, project },
          form: {
            file: file!,
            locale: effectiveLocale,
            ...(target ? { fileId: target } : path ? { path } : {}),
            overwrite: overwrite ? 'true' : 'false',
          },
        }),
      ),
    {
      invalidate: [queries.runs(tenant, project).queryKey, queries.project(tenant, project).queryKey],
      success: m.import_queued(),
      onSuccess: (run) => {
        setFile(null)
        onQueued?.(run.id)
      },
    },
  )

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (file) upload.mutate(undefined)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{m.import_title()}</CardTitle>
        <CardDescription>{m.import_subtitle()}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit}>
          <FieldGroup>
            <label className="hover:bg-muted/50 flex cursor-pointer flex-col items-center rounded-lg border border-dashed px-4 py-8 text-center text-sm">
              <FileUp className="text-muted-foreground size-6" />
              <span className="mt-2 font-medium">{file ? file.name : m.import_choose()}</span>
              <span className="text-muted-foreground text-xs">.json · .yml · .po</span>
              <input
                type="file"
                className="sr-only"
                accept=".json,.yml,.yaml,.po,.pot"
                onChange={(e) => {
                  const chosen = e.target.files?.[0] ?? null
                  setFile(chosen)
                  const guess = chosen && locales.find((l) => chosen.name.includes(l))
                  if (guess) setLocale(guess)
                }}
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="import-locale">{m.import_locale()}</FieldLabel>
                <NativeSelect
                  id="import-locale"
                  value={effectiveLocale}
                  onChange={(e) => setLocale(e.target.value)}
                >
                  {locales.map((l) => (
                    <option key={l} value={l}>
                      {l}
                      {l === sourceLocale ? ` (${m.project_source()})` : ''}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel htmlFor="import-target">{m.import_target()}</FieldLabel>
                <NativeSelect id="import-target" value={target} onChange={(e) => setTarget(e.target.value)}>
                  <option value="">{m.import_new_file()}</option>
                  {files.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.path}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            </div>
            {!target && (
              <Field>
                <FieldLabel htmlFor="import-path">{m.import_path()}</FieldLabel>
                <Input
                  id="import-path"
                  value={path}
                  onChange={(e) => setPath(e.target.value)}
                  placeholder="locales/%locale%.json"
                  className="font-mono"
                />
                <FieldDescription>{m.import_path_hint()}</FieldDescription>
              </Field>
            )}
            {effectiveLocale !== sourceLocale && (
              <Field orientation="horizontal">
                <Checkbox
                  id="import-overwrite"
                  checked={overwrite}
                  onCheckedChange={(v) => setOverwrite(v === true)}
                />
                <FieldLabel htmlFor="import-overwrite" className="font-normal">
                  {m.import_overwrite()}
                </FieldLabel>
              </Field>
            )}
            <div>
              <Button type="submit" disabled={!file || !effectiveLocale || upload.isPending}>
                {m.import_submit()}
              </Button>
            </div>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}
