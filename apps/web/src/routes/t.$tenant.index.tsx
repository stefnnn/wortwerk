import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { FolderPlus, Plus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { LocaleInput } from '#/components/app/locale-input.tsx'
import { EmptyState, PageBody, PageHeader } from '#/components/app/page.tsx'
import { Badge } from '#/components/ui/badge.tsx'
import { Button } from '#/components/ui/button.tsx'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog.tsx'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '#/components/ui/field.tsx'
import { Input } from '#/components/ui/input.tsx'
import { Skeleton } from '#/components/ui/skeleton.tsx'
import { t, unwrap } from '#/lib/api.ts'
import { slugify } from '#/lib/format.ts'
import { useAction } from '#/lib/mutations.ts'
import { queries } from '#/lib/queries.ts'
import { m } from '#/paraglide/messages.js'

export const Route = createFileRoute('/t/$tenant/')({
  head: () => ({ meta: [{ title: `${m.nav_projects()} · wortwerk` }] }),
  component: Projects,
})

function Projects() {
  const { tenant } = Route.useParams()
  const projects = useQuery(queries.projects(tenant))
  const [open, setOpen] = useState(false)

  return (
    <>
      <PageHeader
        title={m.nav_projects()}
        description={m.projects_subtitle()}
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus /> {m.projects_new()}
          </Button>
        }
      />
      <PageBody>
        {projects.isPending ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
        ) : !projects.data?.length ? (
          <EmptyState
            icon={<FolderPlus />}
            title={m.projects_empty_title()}
            body={m.projects_empty_body()}
            action={
              <Button onClick={() => setOpen(true)}>
                <Plus /> {m.projects_new()}
              </Button>
            }
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {projects.data.map((p) => (
              <Link
                key={p.id}
                to="/t/$tenant/p/$project"
                params={{ tenant, project: p.slug }}
                className="bg-card hover:border-primary/60 rounded-xl border p-5 transition-colors"
              >
                <h2 className="font-medium">{p.name}</h2>
                <p className="text-muted-foreground mt-0.5 font-mono text-xs">{p.slug}</p>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {p.locales.map((l) => (
                    <Badge
                      key={l.code}
                      variant={l.code === p.sourceLocale ? 'default' : 'outline'}
                      className="font-mono"
                    >
                      {l.code}
                    </Badge>
                  ))}
                </div>
              </Link>
            ))}
          </div>
        )}
      </PageBody>
      <CreateProjectDialog tenant={tenant} open={open} onOpenChange={setOpen} />
    </>
  )
}

function CreateProjectDialog({
  tenant,
  open,
  onOpenChange,
}: {
  tenant: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [slug, setSlug] = useState<string | null>(null)
  const [sourceLocale, setSourceLocale] = useState('en')
  const [locales, setLocales] = useState('de')
  const effectiveSlug = slug ?? slugify(name)

  const create = useAction(
    () =>
      unwrap(
        t.projects.$post({
          param: { tenant },
          json: {
            name,
            slug: effectiveSlug,
            sourceLocale: sourceLocale.trim(),
            locales: locales.split(/[\s,]+/).filter(Boolean),
          },
        }),
      ),
    {
      invalidate: [queries.projects(tenant).queryKey],
      onSuccess: (project) => {
        onOpenChange(false)
        navigate({ to: '/t/$tenant/p/$project/files', params: { tenant, project: project.slug } })
      },
    },
  )

  const submit = (event: FormEvent) => {
    event.preventDefault()
    create.mutate(undefined)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{m.projects_new()}</DialogTitle>
            <DialogDescription>{m.projects_new_body()}</DialogDescription>
          </DialogHeader>
          <FieldGroup className="py-6">
            <Field>
              <FieldLabel htmlFor="project-name">{m.field_name()}</FieldLabel>
              <Input
                id="project-name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Web app"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="project-slug">{m.field_slug()}</FieldLabel>
              <Input
                id="project-slug"
                required
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                value={effectiveSlug}
                onChange={(e) => setSlug(e.target.value)}
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel htmlFor="project-source">{m.field_source_locale()}</FieldLabel>
                <LocaleInput
                  id="project-source"
                  required
                  value={sourceLocale}
                  onChange={(e) => setSourceLocale(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="project-locales">{m.field_target_locales()}</FieldLabel>
                <Input
                  id="project-locales"
                  value={locales}
                  onChange={(e) => setLocales(e.target.value)}
                  placeholder="de, fr, it"
                />
              </Field>
            </div>
            <FieldDescription>{m.projects_locales_hint()}</FieldDescription>
          </FieldGroup>
          <DialogFooter>
            <Button type="submit" disabled={create.isPending}>
              {m.action_create()}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
