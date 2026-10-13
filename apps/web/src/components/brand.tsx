import { cn } from '#/lib/utils.ts'

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2 font-semibold tracking-tight', className)}>
      <svg viewBox="0 0 32 32" className="size-6" aria-hidden>
        <rect width="32" height="32" rx="8" className="fill-primary" />
        <path
          d="M8 10l3.2 12L16 12l4.8 10L24 10"
          fill="none"
          stroke="currentColor"
          className="text-primary-foreground"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      wortwerk
    </span>
  )
}
