import { cn } from '#/lib/utils.ts'
import { m } from '#/paraglide/messages.js'

export function PoweredByClaude({ className }: { className?: string }) {
  return (
    <p className={cn('text-muted-foreground flex items-center gap-1.5 text-xs', className)}>
      <svg viewBox="0 0 24 24" className="size-3 shrink-0" fill="currentColor" aria-hidden>
        <path d="M17.304 3.541h-3.672l6.696 16.918H24Zm-10.608 0L0 20.459h3.744l1.37-3.553h7.005l1.369 3.553h3.744L10.536 3.541Zm-.371 10.223 2.291-5.946 2.292 5.946Z" />
      </svg>
      {m.powered_by_claude()}
    </p>
  )
}
