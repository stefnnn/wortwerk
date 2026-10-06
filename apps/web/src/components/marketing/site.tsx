import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { Logo } from '#/components/brand.tsx'
import { LocaleSwitch, ThemeToggle } from '#/components/preferences.tsx'
import { buttonVariants } from '#/components/ui/button.tsx'
import { competitors } from '#/lib/compare.ts'
import { m } from '#/paraglide/messages.js'

export function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  )
}

function SiteHeader() {
  return (
    <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-2 px-6 py-5">
      <Link to="/" aria-label="wortwerk">
        <Logo className="text-lg" />
      </Link>
      <nav className="flex items-center gap-1">
        <Link
          to="/"
          hash="pricing"
          className={buttonVariants({ variant: 'ghost', size: 'sm', className: 'max-sm:hidden' })}
        >
          {m.nav_pricing()}
        </Link>
        <Link
          to="/"
          hash="faq"
          className={buttonVariants({ variant: 'ghost', size: 'sm', className: 'max-sm:hidden' })}
        >
          {m.nav_faq()}
        </Link>
        <LocaleSwitch />
        <ThemeToggle />
        <Link to="/sign-in" className={buttonVariants({ size: 'sm' })}>
          {m.nav_sign_in()}
        </Link>
      </nav>
    </header>
  )
}

function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="text-muted-foreground mx-auto grid max-w-6xl gap-10 px-6 py-12 text-sm sm:grid-cols-[1fr_auto_auto]">
        <div className="space-y-3">
          <Logo className="text-foreground" />
          <p className="max-w-xs">{m.footer_tagline()}</p>
          <p className="inline-flex items-center gap-2">
            <SwissFlag className="size-4 rounded-[3px]" /> {m.footer_made_in()}
          </p>
        </div>
        <FooterLinks title={m.footer_product()}>
          <Link to="/" hash="how">
            {m.cta_how_it_works()}
          </Link>
          <Link to="/" hash="pricing">
            {m.nav_pricing()}
          </Link>
          <Link to="/" hash="faq">
            {m.nav_faq()}
          </Link>
          <Link to="/privacy">{m.privacy_title()}</Link>
        </FooterLinks>
        <FooterLinks title={m.footer_compare()}>
          {competitors.map((c) => (
            <Link key={c.slug} to="/compare/$slug" params={{ slug: c.slug }}>
              wortwerk vs. {c.name}
            </Link>
          ))}
        </FooterLinks>
      </div>
    </footer>
  )
}

function FooterLinks({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h2 className="text-foreground mb-3 font-medium">{title}</h2>
      <div className="[&>a:hover]:text-foreground flex flex-col gap-2 [&>a]:w-fit [&>a]:transition-colors">
        {children}
      </div>
    </div>
  )
}

export function SwissFlag({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} role="img" aria-label={m.footer_flag()}>
      <rect width="32" height="32" fill="#da291c" />
      <path d="M13 6h6v7h7v6h-7v7h-6v-7H6v-6h7z" fill="#fff" />
    </svg>
  )
}

export function PageHeading({
  kicker,
  title,
  children,
}: {
  kicker?: string
  title: string
  children?: ReactNode
}) {
  return (
    <div className="mx-auto max-w-3xl px-6 pt-12 pb-10 md:pt-20">
      {kicker && <p className="text-primary mb-3 text-sm font-medium">{kicker}</p>}
      <h1 className="text-3xl font-semibold tracking-tight text-balance md:text-5xl">{title}</h1>
      {children && <div className="text-muted-foreground mt-5 text-lg text-pretty">{children}</div>}
    </div>
  )
}
