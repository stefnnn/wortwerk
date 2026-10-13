import { Badge } from '#/components/ui/badge.tsx'
import { cn } from '#/lib/utils.ts'
import { m } from '#/paraglide/messages.js'

export type Status = 'untranslated' | 'translated' | 'needs_review' | 'approved'

export function statusLabel(status: Status) {
  return {
    untranslated: m.status_untranslated(),
    translated: m.status_translated(),
    needs_review: m.status_needs_review(),
    approved: m.status_approved(),
  }[status]
}

const styles: Record<Status, string> = {
  untranslated: 'bg-muted text-muted-foreground',
  translated: 'bg-[var(--jade-3)] text-[var(--jade-11)]',
  needs_review: 'bg-warning-surface text-warning',
  approved: 'bg-primary text-primary-foreground',
}

export function StatusBadge({ status, className }: { status: Status; className?: string }) {
  return (
    <Badge variant="secondary" className={cn('border-0 font-normal', styles[status], className)}>
      {statusLabel(status)}
    </Badge>
  )
}

export function ProgressBar({
  total,
  translated,
  needsReview,
  approved,
}: {
  total: number
  translated: number
  needsReview: number
  approved: number
}) {
  const pct = (n: number) => (total ? `${(n / total) * 100}%` : '0%')
  return (
    <div className="bg-muted flex h-1.5 w-full overflow-hidden rounded-full">
      <div className="bg-primary" style={{ width: pct(approved) }} />
      <div className="bg-[var(--jade-7)]" style={{ width: pct(translated) }} />
      <div className="bg-[var(--amber-8)]" style={{ width: pct(needsReview) }} />
    </div>
  )
}
