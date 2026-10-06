import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Check, CornerDownLeft, Eye, ImagePlus, Sparkles, Trash2 } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import {
  buildPluralIcu,
  icuArguments,
  localePluralCategories,
  parsePluralIcu,
  validateIcu,
} from '@wortwerk/formats/icu'
import { StatusBadge, type Status } from '#/components/app/status.tsx'
import { Badge } from '#/components/ui/badge.tsx'
import { Button } from '#/components/ui/button.tsx'
import { Input } from '#/components/ui/input.tsx'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#/components/ui/tabs.tsx'
import { Textarea } from '#/components/ui/textarea.tsx'
import { t, unwrap } from '#/lib/api.ts'
import { formatDateTime } from '#/lib/format.ts'
import { useAction } from '#/lib/mutations.ts'
import { queries } from '#/lib/queries.ts'
import { cn } from '#/lib/utils.ts'
import { m } from '#/paraglide/messages.js'

export type EditorItem = {
  id: string
  name: string
  context: string
  description: string
  isPlural: boolean
  source: string | null
  value: string | null
  status: string
}

type Props = {
  tenant: string
  project: string
  item: EditorItem
  locale: string
  sourceLocale: string
  onNext?: () => void
}

export function KeyEditor({ tenant, project, item, locale, sourceLocale, onNext }: Props) {
  const queryClient = useQueryClient()
  const isSource = locale === sourceLocale
  const sourcePlural = useMemo(() => parsePluralIcu(item.source ?? ''), [item.source])
  const plural = item.isPlural || sourcePlural !== null
  const categories = useMemo(() => localePluralCategories(locale), [locale])
  const [draft, setDraft] = useState(item.value ?? '')
  const [raw, setRaw] = useState(!plural)

  const forms = useMemo(() => parsePluralIcu(draft)?.branches ?? {}, [draft])
  const setForm = (category: string, text: string) => {
    const next = Object.fromEntries(categories.map((c) => [c, c === category ? text : (forms[c] ?? '')]))
    setDraft(Object.values(next).some(Boolean) ? buildPluralIcu(next, sourcePlural?.variable ?? 'count') : '')
  }

  const issue = draft ? validateIcu(draft) : null
  const placeholders = useMemo(() => {
    if (!item.source || !draft || isSource) return { missing: [], extra: [] }
    const expected = icuArguments(item.source)
    const actual = icuArguments(draft)
    return {
      missing: expected.filter((a) => !actual.includes(a)),
      extra: actual.filter((a) => !expected.includes(a)),
    }
  }, [item.source, draft, isSource])

  const invalidate = [
    ['tenant', tenant, 'project', project, 'keys'],
    queries.stats(tenant, project).queryKey,
    queries.revisions(tenant, item.id, locale).queryKey,
  ]
  const tenantInfo = useQuery(queries.tenant(tenant))
  const machine = useAction(
    () => unwrap(t.keys[':keyId'].machine.$post({ param: { tenant, keyId: item.id }, json: { locale } })),
    { onSuccess: (result) => setDraft(result.value) },
  )
  const save = useAction(
    ({ status }: { status?: Status; advance?: boolean }) =>
      unwrap(
        t.keys[':keyId'].translations[':locale'].$put({
          param: { tenant, keyId: item.id, locale },
          json: { value: draft, status },
        }),
      ),
    {
      invalidate,
      onSuccess: (_, { advance }) => {
        if (advance) onNext?.()
      },
    },
  )

  const submit = (event?: FormEvent) => {
    event?.preventDefault()
    save.mutate({ advance: true })
  }
  const dirty = draft !== (item.value ?? '')

  return (
    <div className="grid gap-5 p-6">
      <div>
        <code className="text-sm break-all">{item.name}</code>
        {item.context && (
          <Badge variant="outline" className="ml-2">
            {item.context}
          </Badge>
        )}
        {item.description && <p className="text-muted-foreground mt-1.5 text-sm">{item.description}</p>}
      </div>

      {!isSource && (
        <div className="bg-muted rounded-lg px-3.5 py-3">
          <p className="text-muted-foreground mb-1 text-xs font-medium">
            {m.editor_source()} · {sourceLocale}
          </p>
          {sourcePlural ? (
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
              {Object.entries(sourcePlural.branches).map(([category, text]) => (
                <div key={category} className="contents">
                  <dt className="text-muted-foreground font-mono text-xs leading-5">{category}</dt>
                  <dd className="whitespace-pre-wrap">{text}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-sm whitespace-pre-wrap">{item.source ?? '—'}</p>
          )}
        </div>
      )}

      <form onSubmit={submit} className="grid gap-3">
        <div className="flex items-center justify-between">
          <p className="text-muted-foreground text-xs font-medium">
            {m.editor_translation()} · {locale}
          </p>
          <div className="flex items-center gap-2">
            {plural && (
              <Button type="button" variant="ghost" size="xs" onClick={() => setRaw(!raw)}>
                {raw ? m.editor_plural_forms() : m.editor_raw_icu()}
              </Button>
            )}
            <StatusBadge status={item.status as Status} />
          </div>
        </div>

        {plural && !raw ? (
          <div className="grid gap-2">
            {categories.map((category) => (
              <label key={category} className="grid grid-cols-[4rem_1fr] items-center gap-2">
                <span className="text-muted-foreground font-mono text-xs">{category}</span>
                <Input
                  value={forms[category] ?? ''}
                  onChange={(e) => setForm(category, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit()
                  }}
                />
              </label>
            ))}
            <p className="text-muted-foreground text-xs">{m.editor_plural_hint()}</p>
          </div>
        ) : (
          <Textarea
            autoFocus
            rows={4}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit()
            }}
            className="font-mono text-sm"
          />
        )}

        {(issue || placeholders.missing.length > 0 || placeholders.extra.length > 0) && (
          <div className="bg-warning-surface text-warning grid gap-1 rounded-lg px-3 py-2 text-xs">
            {issue && (
              <p className="flex gap-1.5">
                <AlertTriangle className="size-3.5 shrink-0" />{' '}
                {m.editor_invalid_icu({ message: issue.message })}
              </p>
            )}
            {placeholders.missing.length > 0 && (
              <p className="flex gap-1.5">
                <AlertTriangle className="size-3.5 shrink-0" />{' '}
                {m.editor_missing_placeholders({ names: placeholders.missing.join(', ') })}
              </p>
            )}
            {placeholders.extra.length > 0 && (
              <p className="flex gap-1.5">
                <AlertTriangle className="size-3.5 shrink-0" />{' '}
                {m.editor_extra_placeholders({ names: placeholders.extra.join(', ') })}
              </p>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={!!issue || save.isPending || (!dirty && !onNext)}>
            <CornerDownLeft /> {onNext ? m.editor_save_next() : m.action_save()}
          </Button>
          {!isSource && (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={!draft || !!issue || save.isPending}
                onClick={() => save.mutate({ status: 'approved' })}
              >
                <Check /> {m.editor_approve()}
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={!draft || !!issue || save.isPending}
                onClick={() => save.mutate({ status: 'needs_review' })}
              >
                <Eye /> {m.editor_flag_review()}
              </Button>
              {tenantInfo.data?.features.machineTranslation && item.source && (
                <Button
                  type="button"
                  variant="ghost"
                  className="ml-auto"
                  disabled={machine.isPending}
                  onClick={() => machine.mutate(undefined)}
                >
                  <Sparkles className={cn(machine.isPending && 'animate-pulse')} /> {m.editor_machine()}
                </Button>
              )}
            </>
          )}
        </div>
      </form>

      <Tabs defaultValue={isSource ? 'history' : 'suggestions'}>
        <TabsList>
          {!isSource && <TabsTrigger value="suggestions">{m.editor_tab_suggestions()}</TabsTrigger>}
          <TabsTrigger value="history">{m.editor_tab_history()}</TabsTrigger>
          <TabsTrigger value="comments">{m.editor_tab_comments()}</TabsTrigger>
          <TabsTrigger value="screenshots">{m.editor_tab_screenshots()}</TabsTrigger>
        </TabsList>
        {!isSource && (
          <TabsContent value="suggestions">
            <Suggestions tenant={tenant} keyId={item.id} locale={locale} onUse={setDraft} />
          </TabsContent>
        )}
        <TabsContent value="history">
          <History tenant={tenant} keyId={item.id} locale={locale} onRestore={setDraft} />
        </TabsContent>
        <TabsContent value="comments">
          <Comments
            tenant={tenant}
            keyId={item.id}
            onChange={() => queryClient.invalidateQueries({ queryKey: invalidate[0] })}
          />
        </TabsContent>
        <TabsContent value="screenshots">
          <Screenshots
            tenant={tenant}
            keyId={item.id}
            onChange={() => queryClient.invalidateQueries({ queryKey: invalidate[0] })}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function Suggestions({
  tenant,
  keyId,
  locale,
  onUse,
}: {
  tenant: string
  keyId: string
  locale: string
  onUse: (v: string) => void
}) {
  const suggestions = useQuery(queries.suggestions(tenant, keyId, locale))
  if (!suggestions.data?.length)
    return <p className="text-muted-foreground py-4 text-sm">{m.editor_no_suggestions()}</p>
  return (
    <ul className="grid gap-2 py-2">
      {suggestions.data.map((s) => (
        <li key={s.value}>
          <button
            onClick={() => onUse(s.value)}
            className="hover:border-primary/60 grid w-full gap-1 rounded-lg border p-3 text-left text-sm"
          >
            <span className="text-muted-foreground flex items-center justify-between gap-2 text-xs">
              <span className="truncate">
                {s.projectName} · <code>{s.keyName}</code>
              </span>
              <Badge variant="secondary">{Math.round(s.score * 100)}%</Badge>
            </span>
            <span className="text-muted-foreground">{s.source}</span>
            <span>{s.value}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}

function revisionLabel(source: string) {
  const labels: Record<string, () => string> = {
    editor: m.revision_editor,
    import: m.revision_import,
    git: m.revision_git,
    machine: m.revision_machine,
  }
  return labels[source]?.() ?? source
}

function History({
  tenant,
  keyId,
  locale,
  onRestore,
}: {
  tenant: string
  keyId: string
  locale: string
  onRestore: (v: string) => void
}) {
  const revisions = useQuery(queries.revisions(tenant, keyId, locale))
  if (!revisions.data?.length)
    return <p className="text-muted-foreground py-4 text-sm">{m.editor_no_history()}</p>
  return (
    <ol className="grid gap-3 py-2">
      {revisions.data.map((r) => (
        <li key={r.id} className="grid gap-1 border-l-2 pl-3 text-sm">
          <span className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
            {formatDateTime(r.createdAt)} · {r.user?.name ?? m.editor_system()} · {revisionLabel(r.source)}
            <StatusBadge status={r.status as Status} />
          </span>
          <span className={cn('whitespace-pre-wrap', !r.value && 'text-muted-foreground italic')}>
            {r.value || '—'}
          </span>
          <button className="text-primary w-fit text-xs hover:underline" onClick={() => onRestore(r.value)}>
            {m.editor_restore()}
          </button>
        </li>
      ))}
    </ol>
  )
}

function Comments({ tenant, keyId, onChange }: { tenant: string; keyId: string; onChange: () => void }) {
  const comments = useQuery(queries.comments(tenant, keyId))
  const [body, setBody] = useState('')
  const add = useAction(
    () => unwrap(t.keys[':keyId'].comments.$post({ param: { tenant, keyId }, json: { body } })),
    {
      invalidate: [queries.comments(tenant, keyId).queryKey],
      onSuccess: () => {
        setBody('')
        onChange()
      },
    },
  )
  const remove = useAction(
    (commentId: string) => unwrap(t.comments[':commentId'].$delete({ param: { tenant, commentId } })),
    { invalidate: [queries.comments(tenant, keyId).queryKey], onSuccess: onChange },
  )
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (body.trim()) add.mutate(undefined)
  }
  return (
    <div className="grid gap-3 py-2">
      {comments.data?.map((c) => (
        <div key={c.id} className="group bg-muted grid gap-1 rounded-lg px-3 py-2 text-sm">
          <span className="text-muted-foreground flex items-center justify-between text-xs">
            {c.user?.name ?? m.editor_system()} · {formatDateTime(c.createdAt)}
            <button
              className="opacity-0 group-hover:opacity-100"
              aria-label={m.action_remove()}
              onClick={() => remove.mutate(c.id)}
            >
              <Trash2 className="size-3.5" />
            </button>
          </span>
          <p className="whitespace-pre-wrap">{c.body}</p>
        </div>
      ))}
      <form onSubmit={submit} className="grid gap-2">
        <Textarea
          rows={2}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={m.editor_comment_placeholder()}
        />
        <Button
          type="submit"
          variant="outline"
          size="sm"
          className="w-fit"
          disabled={add.isPending || !body.trim()}
        >
          {m.editor_comment_add()}
        </Button>
      </form>
    </div>
  )
}

function Screenshots({ tenant, keyId, onChange }: { tenant: string; keyId: string; onChange: () => void }) {
  const shots = useQuery(queries.screenshots(tenant, keyId))
  const upload = useAction(
    (file: File) => unwrap(t.keys[':keyId'].screenshots.$post({ param: { tenant, keyId }, form: { file } })),
    { invalidate: [queries.screenshots(tenant, keyId).queryKey], onSuccess: onChange },
  )
  const remove = useAction(
    (screenshotId: string) =>
      unwrap(t.screenshots[':screenshotId'].$delete({ param: { tenant, screenshotId } })),
    { invalidate: [queries.screenshots(tenant, keyId).queryKey], onSuccess: onChange },
  )
  return (
    <div className="grid gap-3 py-2">
      <div className="grid grid-cols-2 gap-2">
        {shots.data?.map((s) => (
          <figure key={s.id} className="group relative overflow-hidden rounded-lg border">
            <a href={`/api/t/${tenant}/screenshots/${s.id}`} target="_blank" rel="noreferrer">
              <img
                src={`/api/t/${tenant}/screenshots/${s.id}`}
                alt={s.filename}
                className="aspect-video w-full object-cover"
              />
            </a>
            <Button
              variant="secondary"
              size="icon-xs"
              className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100"
              aria-label={m.action_remove()}
              onClick={() => remove.mutate(s.id)}
            >
              <Trash2 />
            </Button>
          </figure>
        ))}
      </div>
      <label className="hover:bg-muted flex w-fit cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-sm">
        <ImagePlus className="size-4" /> {m.editor_screenshot_add()}
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) upload.mutate(file)
            e.target.value = ''
          }}
        />
      </label>
    </div>
  )
}
