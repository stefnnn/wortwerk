import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Plus, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { LocaleInput } from '#/components/app/locale-input.tsx'
import { PageBody } from '#/components/app/page.tsx'
import { Badge } from '#/components/ui/badge.tsx'
import { Button } from '#/components/ui/button.tsx'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#/components/ui/card.tsx'
import { Field, FieldLabel } from '#/components/ui/field.tsx'
import { Input } from '#/components/ui/input.tsx'
import { t, unwrap } from '#/lib/api.ts'
import { localeName } from '#/lib/format.ts'
import { useAction } from '#/lib/mutations.ts'
import { queries } from '#/lib/queries.ts'
import { m } from '#/paraglide/messages.js'

export const Route = createFileRoute('/t/$tenant/p/$project/settings')({
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
      onSuccess: () => setLocale(''),
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
        <CardContent>
          <form onSubmit={onRename} className="flex items-end gap-2">
            <Field className="flex-1">
              <FieldLabel htmlFor="name">{m.field_name()}</FieldLabel>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
            </Field>
            <Button type="submit" disabled={rename.isPending || name === details.data.name}>
              {m.action_save()}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{m.settings_locales()}</CardTitle>
          <CardDescription>{m.settings_locales_body()}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex flex-wrap gap-2">
            {details.data.locales.map(({ code }) => (
              <Badge
                key={code}
                variant={code === details.data.sourceLocale ? 'default' : 'outline'}
                className="h-7 gap-1 pr-1 pl-2.5"
              >
                <span className="font-mono">{code}</span>
                <span className="text-xs opacity-70">{localeName(code)}</span>
                {code !== details.data.sourceLocale && (
                  <button
                    className="hover:bg-muted ml-1 rounded p-0.5"
                    aria-label={m.action_remove()}
                    onClick={() => removeLocale.mutate(code)}
                  >
                    <X className="size-3" />
                  </button>
                )}
              </Badge>
            ))}
          </div>
          <form onSubmit={onAddLocale} className="flex max-w-sm gap-2">
            <LocaleInput value={locale} onChange={(e) => setLocale(e.target.value)} placeholder="fr-CH" />
            <Button type="submit" variant="outline" disabled={addLocale.isPending}>
              <Plus /> {m.action_add()}
            </Button>
          </form>
        </CardContent>
      </Card>

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
