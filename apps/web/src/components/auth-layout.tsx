import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { Logo } from '#/components/brand.tsx'
import { LocaleSwitch, ThemeToggle } from '#/components/preferences.tsx'

export function AuthLayout({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between px-6 py-5">
        <Link to="/">
          <Logo />
        </Link>
        <div className="flex gap-1">
          <LocaleSwitch />
          <ThemeToggle />
        </div>
      </header>
      <main className="flex flex-1 items-start justify-center px-6 pt-[12vh]">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {description && <p className="text-muted-foreground mt-2 text-sm">{description}</p>}
          <div className="mt-8">{children}</div>
        </div>
      </main>
    </div>
  )
}
