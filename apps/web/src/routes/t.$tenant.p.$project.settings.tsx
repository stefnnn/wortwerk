import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Plus, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { LocaleInput } from '#/components/app/locale-input.tsx'
import { PageBody } from '#/components/app/page.tsx'
import { RepoCard, TokensCard } from '#/components/app/repo-settings.tsx'
import { Badge } from '#/components/ui/badge.tsx'
import { Button } from '#/components/ui/button.tsx'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#/components/ui/card.tsx'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog.tsx'
import { Field, FieldLabel } from '#/components/ui/field.tsx'
import { Input } from '#/components/ui/input.tsx'
import { Textarea } from '#/components/ui/textarea.tsx'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#/components/ui/tabs.tsx'
import { t, unwrap } from '#/lib/api.ts'
import { localeName } from '#/lib/format.ts'
import { useAction } from '#/lib/mutations.ts'
import { queries } from '#/lib/queries.ts'
import { m } from '#/paraglide/messages.js'

export const Route = createFileRoute('/t/$tenant/p/$project/settings')({
  // guests only edit content
  beforeLoad: ({ context, params }) => {
    if (context.tenant.role === 'guest') throw redirect({ to: '/t/$tenant/p/$project', params })
  },
  component: ProjectSettings,
})

function ProjectSettings() {
  const { tenant, project } = Route.useParams()
  const navigate = useNavigate()
  const details = useQuery(queries.project(tenant, project))
  const obsolete = useQuery(
    queries.keys(tenant, project, { locale: details.data?.sourceLocale ?? 'en', obsolete: true }),
  )
  const [nameDraft, setName] = useState<string | null>(null)
  const [locale, setLocale] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [instructionTab, setInstructionTab] = useState('project-context')
  const [confirm, setConfirm] = useState('')
  const projectKey = queries.project(tenant, project).queryKey
  const name = nameDraft ?? details.data?.name ?? ''
  const param = { tenant, project }

  const rename = useAction(() => unwrap(t.projects[':project'].$patch({ param, json: { name } })), {
    invalidate: [projectKey, queries.projects(tenant).queryKey],
    success: m.saved(),
    onSuccess: () => setName(null),
  })
  const addLocale = useAction(
    () => unwrap(t.projects[':project'].locales.$post({ param, json: { code: locale.trim() } })),
    {
      invalidate: [projectKey, queries.stats(tenant, project).queryKey, queries.projects(tenant).queryKey],
      onSuccess: () => {
        setLocale('')
        setAddOpen(false)
      },
    },
  )
  const removeLocale = useAction(
    (code: string) => unwrap(t.projects[':project'].locales[':code'].$delete({ param: { ...param, code } })),
    { invalidate: [projectKey, queries.stats(tenant, project).queryKey, queries.projects(tenant).queryKey] },
  )
  const purge = useAction(() => unwrap(t.projects[':project'].keys.purge.$post({ param })), {
    invalidate: [['tenant', tenant, 'project', project]],
    success: m.settings_purged(),
  })
  const remove = useAction(() => unwrap(t.projects[':project'].$delete({ param })), {
    invalidate: [queries.projects(tenant).queryKey],
    onSuccess: () => navigate({ to: '/t/$tenant', params: { tenant } }),
  })

  const onRename = (event: FormEvent) => {
    event.preventDefault()
    rename.mutate(undefined)
  }
  const onAddLocale = (event: FormEvent) => {
    event.preventDefault()
    if (locale.trim()) addLocale.mutate(undefined)
  }

  if (!details.data) return null
  const obsoleteCount = obsolete.data?.total ?? 0

  return (
    <PageBody className="grid max-w-3xl gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{m.settings_general()}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5">
          <form onSubmit={onRename} className="flex items-end gap-2">
            <Field className="flex-1">
              <FieldLabel htmlFor="name">{m.field_name()}</FieldLabel>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
            </Field>
            <Button type="submit" disabled={rename.isPending || name === details.data.name}>
              {m.action_save()}
            </Button>
          </form>
          <div className="grid gap-3">
            <div className="text-sm font-medium">{m.settings_locales()}</div>
            <div className="flex flex-wrap items-center gap-2">
              {[...details.data.locales]
                .sort(
                  (a, b) =>
                    Number(b.code === details.data.sourceLocale) -
                    Number(a.code === details.data.sourceLocale),
                )
                .map(({ code }) => (
                  <Badge
                    key={code}
                    variant={code === details.data.sourceLocale ? 'default' : 'outline'}
                    className="h-7 gap-1 pr-1 pl-2.5"
                  >
                    <span className="font-mono">{code}</span>
                    <span className="text-xs opacity-70">{localeName(code)}</span>
                    {code !== details.data.sourceLocale && (
                      <button
                        type="button"
                        className="hover:bg-muted ml-1 rounded p-0.5"
                        aria-label={m.action_remove()}
                        onClick={() => removeLocale.mutate(code)}
                      >
                        <X className="size-3" />
                      </button>
                    )}
                  </Badge>
                ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 rounded-full px-2.5"
                onClick={() => setAddOpen(true)}
              >
                <Plus /> {m.action_add()}
              </Button>
            </div>
            <p className="text-muted-foreground text-xs">{m.settings_locales_body()}</p>
          </div>
          <div className="grid gap-2">
            <h3 className="text-sm font-medium">{m.settings_mt_instructions()}</h3>
            <Tabs
              value={instructionTab}
              onValueChange={(value) => value && setInstructionTab(value)}
              className="gap-2"
            >
              <TabsList className="max-w-full flex-wrap justify-start">
                <TabsTrigger value="project-context">{m.settings_project_context()}</TabsTrigger>
                {details.data.locales
                  .filter(({ code }) => code !== details.data.sourceLocale)
                  .map(({ code }) => (
                    <TabsTrigger key={code} value={code}>
                      {code}
                    </TabsTrigger>
                  ))}
              </TabsList>
              <TabsContent value="project-context">
                <ProjectContextInstructions
                  key={details.data.instructions}
                  tenant={tenant}
                  project={project}
                  initial={details.data.instructions}
                />
              </TabsContent>
              {details.data.locales
                .filter(({ code }) => code !== details.data.sourceLocale)
                .map(({ code, instructions }) => (
                  <TabsContent key={code} value={code}>
                    <LocaleInstructions
                      key={`${code}:${instructions}`}
                      tenant={tenant}
                      project={project}
                      code={code}
                      initial={instructions}
                    />
                  </TabsContent>
                ))}
            </Tabs>
          </div>
        </CardContent>
      </Card>

      <RepoCard tenant={tenant} project={project} />
      <TokensCard tenant={tenant} project={project} projectId={details.data.id} />

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <form onSubmit={onAddLocale} className="grid gap-4">
            <DialogHeader>
              <DialogTitle>{m.settings_add_locale()}</DialogTitle>
              <DialogDescription>{m.settings_add_locale_body()}</DialogDescription>
            </DialogHeader>
            <Field>
              <FieldLabel htmlFor="new-locale">{m.settings_locale_code()}</FieldLabel>
              <LocaleInput
                id="new-locale"
                autoFocus
                value={locale}
                onChange={(e) => setLocale(e.target.value)}
                placeholder="fr-CH"
              />
            </Field>
            <DialogFooter>
              <Button type="submit" disabled={addLocale.isPending || !locale.trim()}>
                <Plus /> {m.action_add()}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <CardTitle>{m.settings_obsolete()}</CardTitle>
          <CardDescription>{m.settings_obsolete_body({ count: obsoleteCount })}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            disabled={!obsoleteCount || purge.isPending}
            onClick={() => purge.mutate(undefined)}
          >
            {m.settings_purge()}
          </Button>
        </CardContent>
      </Card>

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle>{m.settings_delete()}</CardTitle>
          <CardDescription>{m.settings_delete_body({ slug: details.data.slug })}</CardDescription>
        </CardHeader>
        <CardContent className="flex max-w-sm gap-2">
          <Input
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder={details.data.slug}
            className="font-mono"
          />
          <Button
            variant="destructive"
            disabled={confirm !== details.data.slug || remove.isPending}
            onClick={() => remove.mutate(undefined)}
          >
            {m.action_delete()}
          </Button>
        </CardContent>
      </Card>
    </PageBody>
  )
}

function LocaleInstructions({
  tenant,
  project,
  code,
  initial,
}: {
  tenant: string
  project: string
  code: string
  initial: string
}) {
  const [value, setValue] = useState(initial)
  const save = useAction(
    () =>
      unwrap(
        t.projects[':project'].locales[':code'].$patch({
          param: { tenant, project, code },
          json: { instructions: value },
        }),
      ),
    { invalidate: [queries.project(tenant, project).queryKey], success: m.saved() },
  )
  return (
    <Field className="relative">
      <Textarea
        id={`instructions-${code}`}
        rows={1}
        maxLength={2000}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={m.settings_locale_instructions_placeholder()}
        className="max-h-[8.625rem] min-h-0 overflow-y-auto pb-2 leading-6 md:max-h-[10.125rem] md:pb-8"
      />
      {value.trim() !== initial && (
        <Button
          variant="outline"
          size="sm"
          className="justify-self-end md:absolute md:right-1.5 md:bottom-1.5"
          disabled={save.isPending}
          onClick={() => save.mutate(undefined)}
        >
          {m.action_save()}
        </Button>
      )}
    </Field>
  )
}

function ProjectContextInstructions({
  tenant,
  project,
  initial,
}: {
  tenant: string
  project: string
  initial: string
}) {
  const [value, setValue] = useState(initial)
  const save = useAction(
    () =>
      unwrap(t.projects[':project'].$patch({ param: { tenant, project }, json: { instructions: value } })),
    { invalidate: [queries.project(tenant, project).queryKey], success: m.saved() },
  )
  return (
    <Field className="relative">
      <Textarea
        id="project-context"
        rows={1}
        maxLength={5000}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={m.settings_project_context_placeholder()}
        className="max-h-[8.625rem] min-h-0 overflow-y-auto pb-2 leading-6 md:max-h-[10.125rem] md:pb-8"
      />
      {value.trim() !== initial && (
        <Button
          variant="outline"
          size="sm"
          className="justify-self-end md:absolute md:right-1.5 md:bottom-1.5"
          disabled={save.isPending}
          onClick={() => save.mutate(undefined)}
        >
          {m.action_save()}
        </Button>
      )}
    </Field>
  )
}
