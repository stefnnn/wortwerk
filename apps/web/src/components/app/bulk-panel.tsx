import { useQuery } from '@tanstack/react-query'
import { Check, Eye, Sparkles, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '#/components/ui/button.tsx'
import { t, unwrap } from '#/lib/api.ts'
import { formatNumber } from '#/lib/format.ts'
import { useAction } from '#/lib/mutations.ts'
import { queries } from '#/lib/queries.ts'
import { m } from '#/paraglide/messages.js'

export type KeySelection =
  | { keyIds: string[] }
  | {
      filter: {
        locale: string
        status?: 'untranslated' | 'translated' | 'needs_review' | 'approved'
        sync?: 'pending' | 'conflict'
        search?: string
      }
      excludeKeyIds: string[]
    }

type Props = {
  tenant: string
  project: string
  locale: string
  isSource: boolean
  count: number
  selection: KeySelection
  onClear: () => void
}

export function BulkPanel({ tenant, project, locale, isSource, count, selection, onClear }: Props) {
  const param = { tenant, project }
  const tenantInfo = useQuery(queries.tenant(tenant))
  const canMachine = tenantInfo.data?.features.machineTranslation ?? false

  const setStatus = useAction(
    (status: 'translated' | 'needs_review' | 'approved') =>
      unwrap(t.projects[':project'].keys.status.$post({ param, json: { locale, status, selection } })),
    {
      invalidate: [['tenant', tenant, 'project', project, 'keys'], queries.stats(tenant, project).queryKey],
      onSuccess: (result) =>
        toast.success(m.editor_bulk_status_done({ updated: result.updated, selected: result.selected })),
    },
  )
  const machine = useAction(
    () => unwrap(t.projects[':project'].machine.$post({ param, json: { locale, selection } })),
    { invalidate: [queries.runs(tenant, project).queryKey], success: m.machine_queued() },
  )

  return (
    <div className="grid gap-5 p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tabular-nums">
          {m.editor_selected({ count: formatNumber(count) })}
        </h2>
        <Button variant="ghost" size="sm" onClick={onClear}>
          <X /> {m.editor_clear_selection()}
        </Button>
      </div>

      {isSource ? (
        <p className="text-muted-foreground text-sm">{m.editor_bulk_source()}</p>
      ) : (
        <>
          <div className="grid gap-2">
            <p className="text-muted-foreground text-xs font-medium">{m.editor_status()}</p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={setStatus.isPending}
                onClick={() => setStatus.mutate('approved')}
              >
                <Check /> {m.editor_approve()}
              </Button>
              <Button
                variant="outline"
                disabled={setStatus.isPending}
                onClick={() => setStatus.mutate('needs_review')}
              >
                <Eye /> {m.editor_flag_review()}
              </Button>
              <Button
                variant="outline"
                disabled={setStatus.isPending}
                onClick={() => setStatus.mutate('translated')}
              >
                {m.editor_bulk_mark_translated()}
              </Button>
            </div>
            <p className="text-muted-foreground text-xs">{m.editor_bulk_status_hint()}</p>
          </div>

          {canMachine && (
            <div className="grid gap-2">
              <div>
                <Button
                  variant="outline"
                  disabled={machine.isPending}
                  onClick={() => machine.mutate(undefined)}
                >
                  <Sparkles className={machine.isPending ? 'animate-pulse' : undefined} />{' '}
                  {m.editor_machine()}
                </Button>
              </div>
              <p className="text-muted-foreground text-xs">{m.editor_bulk_machine_hint()}</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
