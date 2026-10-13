import type { ReactNode } from 'react'
import { cn } from '#/lib/utils.ts'

export function PageHeader({
  title,
  description,
  actions,
  children,
}: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="border-b px-6 pt-6 md:px-8">
      <div className="flex flex-wrap items-start justify-between gap-4 pb-5">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {description && <p className="text-muted-foreground mt-1 text-sm">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  )
}

export function PageBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('px-6 py-6 md:px-8', className)}>{children}</div>
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: ReactNode
  title: string
  body?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed px-6 py-16 text-center">
      <div className="text-muted-foreground [&_svg]:size-8">{icon}</div>
      <h2 className="mt-4 font-medium">{title}</h2>
      {body && <p className="text-muted-foreground mt-1 max-w-sm text-sm">{body}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}
