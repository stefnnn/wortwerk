import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import {
  ChevronLeft,
  ChevronRight,
  GitMerge,
  GitPullRequestArrow,
  Image,
  KeyRound,
  MessageSquare,
  Plus,
  Search,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { z } from 'zod'
import { BulkPanel, type KeySelection } from '#/components/app/bulk-panel.tsx'
import { KeyEditor } from '#/components/app/key-editor.tsx'
import { NewKeyDialog } from '#/components/app/new-key-dialog.tsx'
import { EmptyState } from '#/components/app/page.tsx'
import { StatusBadge, statusLabel, type Status } from '#/components/app/status.tsx'
import { Badge } from '#/components/ui/badge.tsx'
import { Button } from '#/components/ui/button.tsx'
import { Checkbox } from '#/components/ui/checkbox.tsx'
import { Input } from '#/components/ui/input.tsx'
import { NativeSelect } from '#/components/ui/native-select.tsx'
import { Sheet, SheetContent, SheetTitle } from '#/components/ui/sheet.tsx'
import { Skeleton } from '#/components/ui/skeleton.tsx'
import { formatNumber, localeName } from '#/lib/format.ts'
import { queries } from '#/lib/queries.ts'
import { cn } from '#/lib/utils.ts'
import { m } from '#/paraglide/messages.js'

// locale filter value that lists every target locale
const ALL_LOCALES = 'all'
const statuses = ['untranslated', 'translated', 'needs_review', 'approved'] as const
const pageSize = 50

const search = z.object({
  locale: z.string().optional().catch(undefined),
  status: z.enum(statuses).optional().catch(undefined),
  sync: z.enum(['pending', 'conflict']).optional().catch(undefined),
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
  const guest = Route.useRouteContext().tenant.role === 'guest'
  const details = useQuery(queries.project(tenant, project))
  const desktop = useIsDesktop()
  const [query, setQuery] = useState(params.q ?? '')
  const [newKeyOpen, setNewKeyOpen] = useState(false)
  const [bulkOpen, setBulkOpen] = useState(false)

  const targets =
    details.data?.locales.map((l) => l.code).filter((c) => c !== details.data.sourceLocale) ?? []
  const locale = params.locale ?? targets[0] ?? details.data?.sourceLocale ?? ''
  // one row per key and target locale
  const all = locale === ALL_LOCALES
  const rowKey = (item: { id: string; locale: string }) => (all ? `${item.id}:${item.locale}` : item.id)
  const page = params.page ?? 0
  const filters = {
    locale,
    status: params.status,
    sync: params.sync,
    search: params.q,
    offset: page * pageSize,
  }
  const repo = useQuery({ ...queries.repo(tenant, project), enabled: !guest })
  const connected = !!repo.data
  const keys = useQuery({ ...queries.keys(tenant, project, filters), enabled: !!locale })

  useEffect(() => {
    const timer = setTimeout(() => {
      if ((params.q ?? '') !== query)
        navigate({ search: (s) => ({ ...s, q: query || undefined, page: undefined }), replace: true })
    }, 250)
    return () => clearTimeout(timer)
  }, [query, params.q, navigate])

  // `picked` holds the ticked keys, or in `allMatching` mode the keys unticked from "all matching".
  // The selection belongs to the filter it was made under and is ignored once the filter changes.
  const filterKey = `${locale}|${params.status ?? ''}|${params.sync ?? ''}|${params.q ?? ''}`
  const [sel, setSel] = useState({ filterKey: '', picked: new Set<string>(), allMatching: false })
  const current =
    sel.filterKey === filterKey ? sel : { filterKey, picked: new Set<string>(), allMatching: false }
  const { picked, allMatching } = current

  const items = keys.data?.items ?? []
  const selectedIndex = items.findIndex((k) => rowKey(k) === params.key)
  const selected = selectedIndex >= 0 ? items[selectedIndex] : undefined
  const total = keys.data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / pageSize))

  const selectedCount = allMatching ? Math.max(0, total - picked.size) : picked.size
  const bulk = selectedCount >= 2
  const isPicked = (id: string) => (allMatching ? !picked.has(id) : picked.has(id))
  const asRow = (id: string) => {
    const at = id.lastIndexOf(':')
    return { keyId: id.slice(0, at), locale: id.slice(at + 1) }
  }
  const toggle = (id: string) => {
    const next = new Set(picked)
    if (!next.delete(id)) next.add(id)
    setSel({ filterKey, picked: next, allMatching })
  }
  const allPicked = total > 0 && selectedCount === total
  const toggleAll = () => setSel({ filterKey, picked: new Set(), allMatching: !allPicked })
  const clearSelection = () => setSel({ filterKey, picked: new Set(), allMatching: false })
  const filter = { locale, status: params.status, sync: params.sync, search: params.q }
  const selection: KeySelection = all
    ? allMatching
      ? { filter, excludeRows: [...picked].map(asRow) }
      : { rows: [...picked].map(asRow) }
    : allMatching
      ? { filter, excludeKeyIds: [...picked] }
      : { keyIds: [...picked] }

  const select = (key?: string) => navigate({ search: (s) => ({ ...s, key }), replace: true })
  const following = items[selectedIndex + 1]
  const next = following ? () => select(rowKey(following)) : undefined
  const showEverywhere = (name: string) => {
    setQuery(name)
    navigate({
      search: (s) => ({
        ...s,
        locale: ALL_LOCALES,
        q: name,
        status: undefined,
        sync: undefined,
        key: undefined,
        page: undefined,
      }),
    })
  }

  if (!details.data) return <Skeleton className="m-8 h-96" />

  const editor = selected && (
    <KeyEditor
      key={`${selected.id}:${selected.locale}`}
      tenant={tenant}
      project={project}
      item={selected}
      locale={selected.locale}
      onShowAll={() => showEverywhere(selected.name)}
      sourceLocale={details.data.sourceLocale}
      onNext={next}
      readOnly={!!details.data.editableLocales && !details.data.editableLocales.includes(selected.locale)}
    />
  )

  const bulkPanel = (
    <BulkPanel
      tenant={tenant}
      project={project}
      locale={locale}
      isSource={locale === details.data.sourceLocale}
      count={selectedCount}
      selection={selection}
      onClear={clearSelection}
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
          {targets.length > 0 && <option value={ALL_LOCALES}>{m.editor_all_languages()}</option>}
          {[...targets, details.data.sourceLocale].map((code) => (
            <option key={code} value={code}>
              {code} · {localeName(code)}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          className="w-44"
          value={params.sync ? `sync:${params.sync}` : (params.status ?? '')}
          aria-label={m.editor_status()}
          onChange={(e) => {
            const value = e.target.value
            const sync = value.startsWith('sync:') ? (value.slice(5) as 'pending' | 'conflict') : undefined
            navigate({
              search: (s) => ({
                ...s,
                status: sync ? undefined : ((value || undefined) as Status | undefined),
                sync,
                page: undefined,
              }),
            })
          }}
        >
          <option value="">{m.editor_all_statuses()}</option>
          {statuses.map((s) => (
            <option key={s} value={s}>
              {statusLabel(s)}
            </option>
          ))}
          {connected && (
            <optgroup label={m.editor_sync_group()}>
              <option value="sync:pending">{m.editor_sync_pending()}</option>
              <option value="sync:conflict">{m.editor_sync_conflict()}</option>
            </optgroup>
          )}
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
        {/* keys of a connected project are added by developers in the repository */}
        {repo.isSuccess && !connected && (
          <Button variant="outline" onClick={() => setNewKeyOpen(true)}>
            <Plus /> {m.editor_new_key()}
          </Button>
        )}
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
            <>
              <div className="text-muted-foreground flex items-center gap-3 border-b py-2 pr-6 pl-1.5 text-sm md:pr-8 md:pl-3">
                <Checkbox
                  checked={allPicked}
                  indeterminate={selectedCount > 0 && !allPicked}
                  onCheckedChange={toggleAll}
                  aria-label={m.editor_select_all()}
                />
                <span className="flex-1 tabular-nums">
                  {selectedCount > 0
                    ? m.editor_selected({ count: formatNumber(selectedCount) })
                    : m.editor_select_all()}
                </span>
                {!desktop && bulk && (
                  <Button variant="outline" size="sm" onClick={() => setBulkOpen(true)}>
                    {m.editor_bulk_actions()}
                  </Button>
                )}
              </div>
              <ul className="divide-y">
                {items.map((item) => (
                  <li key={rowKey(item)} className="group/row relative">
                    <Checkbox
                      checked={isPicked(rowKey(item))}
                      onCheckedChange={() => toggle(rowKey(item))}
                      aria-label={m.editor_select_key_row()}
                      className={cn(
                        'absolute top-3 left-1.5 z-10 bg-background md:left-3',
                        'opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 data-checked:opacity-100 pointer-coarse:opacity-100',
                      )}
                    />
                    <button
                      onClick={() => select(rowKey(item))}
                      className={cn(
                        'grid w-full grid-cols-[minmax(0,1fr)] gap-1 px-6 py-3 text-left hover:bg-muted/60 md:px-8',
                        isPicked(rowKey(item)) && 'bg-accent/50',
                        !bulk && rowKey(item) === params.key && 'bg-accent hover:bg-accent',
                      )}
                    >
                      <span className="flex items-center gap-2">
                        {/* rtl + bdi puts the ellipsis at the start, so the end of long keys stays visible */}
                        <code
                          title={item.name}
                          className="text-muted-foreground min-w-0 flex-1 truncate text-left text-xs [direction:rtl]"
                        >
                          <bdi>
                            {item.context && (
                              <span className="text-[var(--amber-11)]">{item.context} · </span>
                            )}
                            {item.name}
                          </bdi>
                        </code>
                        {item.comments > 0 && (
                          <span className="text-muted-foreground flex items-center gap-0.5 text-xs">
                            <MessageSquare className="size-3" /> {item.comments}
                          </span>
                        )}
                        {item.screenshots > 0 && <Image className="text-muted-foreground size-3" />}
                        {all && (
                          <Badge variant="outline" className="font-mono text-[10px]">
                            {item.locale}
                          </Badge>
                        )}
                        <SyncBadge item={item} />
                        <StatusBadge status={item.status as Status} />
                      </span>
                      <span className="line-clamp-1 text-sm">{item.source ?? '—'}</span>
                      {locale !== details.data.sourceLocale && (
                        <span
                          className={cn(
                            'line-clamp-1 text-sm',
                            !item.value && 'text-muted-foreground italic',
                          )}
                        >
                          {item.value || m.editor_missing()}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </>
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
              {bulk
                ? bulkPanel
                : (editor ?? <p className="text-muted-foreground p-8 text-sm">{m.editor_select_key()}</p>)}
            </div>
          </aside>
        ) : (
          <>
            <Sheet open={!!selected && !bulk} onOpenChange={(open) => !open && select(undefined)}>
              <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-lg">
                <SheetTitle className="sr-only">{selected?.name}</SheetTitle>
                {editor}
              </SheetContent>
            </Sheet>
            <Sheet open={bulk && bulkOpen} onOpenChange={setBulkOpen}>
              <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-lg">
                <SheetTitle className="sr-only">{m.editor_bulk_actions()}</SheetTitle>
                {bulkPanel}
              </SheetContent>
            </Sheet>
          </>
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

function SyncBadge({
  item,
}: {
  item: { conflict: boolean; source: string | null; repoValue: string | null }
}) {
  if (item.conflict)
    return (
      <Badge variant="secondary" className="bg-warning-surface text-warning border-0 font-normal">
        <GitMerge /> {m.editor_sync_conflict()}
      </Badge>
    )
  if (item.repoValue !== null && item.source !== item.repoValue)
    return (
      <Badge variant="outline" className="font-normal" title={m.editor_pending_title()}>
        <GitPullRequestArrow /> {m.editor_sync_pending()}
      </Badge>
    )
  return null
}
