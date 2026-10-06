import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Image, KeyRound, MessageSquare, Plus, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { z } from 'zod'
import { KeyEditor } from '#/components/app/key-editor.tsx'
import { NewKeyDialog } from '#/components/app/new-key-dialog.tsx'
import { EmptyState } from '#/components/app/page.tsx'
import { StatusBadge, statusLabel, type Status } from '#/components/app/status.tsx'
import { Button } from '#/components/ui/button.tsx'
import { Input } from '#/components/ui/input.tsx'
import { NativeSelect } from '#/components/ui/native-select.tsx'
import { Sheet, SheetContent, SheetTitle } from '#/components/ui/sheet.tsx'
import { Skeleton } from '#/components/ui/skeleton.tsx'
import { formatNumber, localeName } from '#/lib/format.ts'
import { queries } from '#/lib/queries.ts'
import { cn } from '#/lib/utils.ts'
import { m } from '#/paraglide/messages.js'

const statuses = ['untranslated', 'translated', 'needs_review', 'approved'] as const
const pageSize = 50

const search = z.object({
  locale: z.string().optional().catch(undefined),
  status: z.enum(statuses).optional().catch(undefined),
  q: z.string().optional().catch(undefined),
  page: z.number().int().min(0).optional().catch(undefined),
  key: z.string().optional().catch(undefined),
})

export const Route = createFileRoute('/t/$tenant/p/$project/editor')({
  validateSearch: search,
  component: Editor,
})

function useIsDesktop() {
  const [desktop, setDesktop] = useState(true)
  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)')
    const update = () => setDesktop(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  return desktop
}

function Editor() {
  const { tenant, project } = Route.useParams()
  const params = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const details = useQuery(queries.project(tenant, project))
  const desktop = useIsDesktop()
  const [query, setQuery] = useState(params.q ?? '')
  const [newKeyOpen, setNewKeyOpen] = useState(false)

  const targets =
    details.data?.locales.map((l) => l.code).filter((c) => c !== details.data.sourceLocale) ?? []
  const locale = params.locale ?? targets[0] ?? details.data?.sourceLocale ?? ''
  const page = params.page ?? 0
  const filters = { locale, status: params.status, search: params.q, offset: page * pageSize }
  const keys = useQuery({ ...queries.keys(tenant, project, filters), enabled: !!locale })

  useEffect(() => {
    const timer = setTimeout(() => {
      if ((params.q ?? '') !== query)
        navigate({ search: (s) => ({ ...s, q: query || undefined, page: undefined }), replace: true })
    }, 250)
    return () => clearTimeout(timer)
  }, [query, params.q, navigate])

  const items = keys.data?.items ?? []
  const selectedIndex = items.findIndex((k) => k.id === params.key)
  const selected = selectedIndex >= 0 ? items[selectedIndex] : undefined
  const total = keys.data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / pageSize))

  const select = (key?: string) => navigate({ search: (s) => ({ ...s, key }), replace: true })
  const following = items[selectedIndex + 1]
  const next = following ? () => select(following.id) : undefined

  if (!details.data) return <Skeleton className="m-8 h-96" />

  const editor = selected && (
    <KeyEditor
      key={`${selected.id}:${locale}`}
      tenant={tenant}
      project={project}
      item={selected}
      locale={locale}
      sourceLocale={details.data.sourceLocale}
      onNext={next}
    />
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b px-6 py-3 md:px-8">
        <NativeSelect
          className="w-48"
          value={locale}
          aria-label={m.editor_locale()}
          onChange={(e) => navigate({ search: (s) => ({ ...s, locale: e.target.value, page: undefined }) })}
        >
          {[...targets, details.data.sourceLocale].map((code) => (
            <option key={code} value={code}>
              {code} · {localeName(code)}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          className="w-44"
          value={params.status ?? ''}
          aria-label={m.editor_status()}
          onChange={(e) =>
            navigate({
              search: (s) => ({
                ...s,
                status: (e.target.value || undefined) as Status | undefined,
                page: undefined,
              }),
            })
          }
        >
          <option value="">{m.editor_all_statuses()}</option>
          {statuses.map((s) => (
            <option key={s} value={s}>
              {statusLabel(s)}
            </option>
          ))}
        </NativeSelect>
        <div className="relative min-w-48 flex-1">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            className="pl-8"
            placeholder={m.editor_search()}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <Button variant="outline" onClick={() => setNewKeyOpen(true)}>
          <Plus /> {m.editor_new_key()}
        </Button>
      </div>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)] xl:grid-cols-[minmax(0,1fr)_minmax(0,34rem)]">
        <div className="min-w-0 border-r">
          {keys.isPending ? (
            <div className="grid gap-px p-4">
              {Array.from({ length: 8 }, (_, i) => (
                <Skeleton key={i} className="h-14" />
              ))}
            </div>
          ) : !items.length ? (
            <div className="p-6">
              <EmptyState icon={<KeyRound />} title={m.editor_empty_title()} body={m.editor_empty_body()} />
            </div>
          ) : (
            <ul className="divide-y">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    onClick={() => select(item.id)}
                    className={cn(
                      'grid w-full gap-1 px-6 py-3 text-left hover:bg-muted/60 md:px-8',
                      item.id === params.key && 'bg-accent hover:bg-accent',
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <code className="text-muted-foreground min-w-0 flex-1 truncate text-xs">
                        {item.context && <span className="text-[var(--amber-11)]">{item.context} · </span>}
                        {item.name}
                      </code>
                      {item.comments > 0 && (
                        <span className="text-muted-foreground flex items-center gap-0.5 text-xs">
                          <MessageSquare className="size-3" /> {item.comments}
                        </span>
                      )}
                      {item.screenshots > 0 && <Image className="text-muted-foreground size-3" />}
                      <StatusBadge status={item.status as Status} />
                    </span>
                    <span className="line-clamp-1 text-sm">{item.source ?? '—'}</span>
                    {locale !== details.data.sourceLocale && (
                      <span
                        className={cn('line-clamp-1 text-sm', !item.value && 'text-muted-foreground italic')}
                      >
                        {item.value || m.editor_missing()}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="text-muted-foreground flex items-center justify-between border-t px-6 py-3 text-sm md:px-8">
            <span>{m.editor_count({ count: formatNumber(total) })}</span>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={m.editor_previous()}
                disabled={page === 0}
                onClick={() => navigate({ search: (s) => ({ ...s, page: page - 1 || undefined }) })}
              >
                <ChevronLeft />
              </Button>
              <span className="tabular-nums">
                {page + 1} / {pages}
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={m.editor_next()}
                disabled={page + 1 >= pages}
                onClick={() => navigate({ search: (s) => ({ ...s, page: page + 1 }) })}
              >
                <ChevronRight />
              </Button>
            </div>
          </div>
        </div>

        {desktop ? (
          <aside className="hidden min-w-0 lg:block">
            <div className="sticky top-0 max-h-dvh overflow-y-auto">
              {editor ?? <p className="text-muted-foreground p-8 text-sm">{m.editor_select_key()}</p>}
            </div>
          </aside>
        ) : (
          <Sheet open={!!selected} onOpenChange={(open) => !open && select(undefined)}>
            <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-lg">
              <SheetTitle className="sr-only">{selected?.name}</SheetTitle>
              {editor}
            </SheetContent>
          </Sheet>
        )}
      </div>
      <NewKeyDialog
        tenant={tenant}
        project={project}
        files={details.data.files}
        open={newKeyOpen}
        onOpenChange={setNewKeyOpen}
        onCreated={(id) => select(id)}
      />
    </div>
  )
}
