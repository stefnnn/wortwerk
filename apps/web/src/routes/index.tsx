import { createFileRoute, Link } from '@tanstack/react-router'
import {
  ArrowRight,
  Check,
  FileCode2,
  GitPullRequest,
  History,
  Languages,
  MessageSquare,
  Sparkles,
} from 'lucide-react'
import { Logo } from '#/components/brand.tsx'
import { LocaleSwitch, ThemeToggle } from '#/components/preferences.tsx'
import { buttonVariants } from '#/components/ui/button.tsx'
import { cn } from '#/lib/utils.ts'
import { m } from '#/paraglide/messages.js'

export const Route = createFileRoute('/')({
  head: () => ({
    meta: [
      { title: `wortwerk — ${m.landing_title()}` },
      { name: 'description', content: m.landing_subtitle() },
    ],
  }),
  component: Landing,
})

function Landing() {
  const features = [
    { icon: GitPullRequest, title: m.feature_git_title(), body: m.feature_git_body() },
    { icon: FileCode2, title: m.feature_formats_title(), body: m.feature_formats_body() },
    { icon: Languages, title: m.feature_icu_title(), body: m.feature_icu_body() },
    { icon: History, title: m.feature_history_title(), body: m.feature_history_body() },
    { icon: MessageSquare, title: m.feature_context_title(), body: m.feature_context_body() },
    { icon: Sparkles, title: m.feature_mt_title(), body: m.feature_mt_body() },
  ]
  const steps = [m.step_connect(), m.step_translate(), m.step_merge()]

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Logo className="text-lg" />
        <nav className="flex items-center gap-1">
          <a href="#pricing" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
            {m.nav_pricing()}
          </a>
          <LocaleSwitch />
          <ThemeToggle />
          <Link to="/sign-in" className={buttonVariants({ size: 'sm' })}>
            {m.nav_sign_in()}
          </Link>
        </nav>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-6 pt-16 pb-24 md:pt-28">
          <p className="bg-accent text-accent-foreground mb-5 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium">
            <GitPullRequest className="size-3.5" /> {m.landing_kicker()}
          </p>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance md:text-6xl">
            {m.landing_title()}
          </h1>
          <p className="text-muted-foreground mt-6 max-w-2xl text-lg text-pretty">{m.landing_subtitle()}</p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link to="/sign-up" className={buttonVariants({ size: 'lg' })}>
              {m.cta_start_free()} <ArrowRight />
            </Link>
            <a href="#how" className={buttonVariants({ size: 'lg', variant: 'outline' })}>
              {m.cta_how_it_works()}
            </a>
          </div>
          <CodePreview />
        </section>

        <section id="how" className="bg-card/60 border-y">
          <div className="mx-auto grid max-w-6xl gap-10 px-6 py-20 md:grid-cols-3">
            {steps.map((step, i) => (
              <div key={step} className="flex gap-4">
                <span className="bg-primary text-primary-foreground flex size-9 shrink-0 items-center justify-center rounded-full font-mono text-sm">
                  {i + 1}
                </span>
                <p className="pt-1.5 text-pretty">{step}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-24">
          <h2 className="text-3xl font-semibold tracking-tight">{m.features_title()}</h2>
          <div className="bg-border mt-12 grid gap-px overflow-hidden rounded-xl border sm:grid-cols-2 lg:grid-cols-3">
            {features.map(({ icon: Icon, title, body }) => (
              <div key={title} className="bg-background p-6">
                <Icon className="text-primary size-5" />
                <h3 className="mt-4 font-medium">{title}</h3>
                <p className="text-muted-foreground mt-2 text-sm">{body}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="pricing" className="mx-auto max-w-6xl px-6 pb-28">
          <h2 className="text-3xl font-semibold tracking-tight">{m.pricing_title()}</h2>
          <div className="mt-12 grid gap-6 md:grid-cols-2">
            <PlanCard
              name="Free"
              price={m.pricing_free_price()}
              items={[
                m.pricing_free_keys(),
                m.pricing_unlimited_users(),
                m.pricing_git(),
                m.pricing_formats(),
              ]}
            />
            <PlanCard
              name="Agency"
              price={m.pricing_agency_price()}
              highlight
              items={[m.pricing_agency_keys(), m.pricing_agency_users(), m.pricing_git(), m.pricing_mt()]}
            />
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="text-muted-foreground mx-auto flex max-w-6xl items-center justify-between px-6 py-8 text-sm">
          <Logo />
          <span>{m.footer_made_in()}</span>
        </div>
      </footer>
    </div>
  )
}

function PlanCard({
  name,
  price,
  items,
  highlight,
}: {
  name: string
  price: string
  items: string[]
  highlight?: boolean
}) {
  return (
    <div className={cn('rounded-xl border bg-card p-8', highlight && 'border-primary ring-1 ring-primary')}>
      <h3 className="font-medium">{name}</h3>
      <p className="mt-2 text-3xl font-semibold tracking-tight">{price}</p>
      <ul className="mt-6 space-y-3 text-sm">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <Check className="text-primary size-4 shrink-0" /> {item}
          </li>
        ))}
      </ul>
      <Link
        to="/sign-up"
        className={cn(buttonVariants({ variant: highlight ? 'default' : 'outline' }), 'mt-8 w-full')}
      >
        {m.cta_start_free()}
      </Link>
    </div>
  )
}

function CodePreview() {
  return (
    <div className="bg-card mt-16 overflow-hidden rounded-xl border shadow-sm">
      <div className="text-muted-foreground flex items-center gap-2 border-b px-4 py-2.5 font-mono text-xs">
        <GitPullRequest className="text-primary size-3.5" /> wortwerk/translations → main
      </div>
      <pre className="overflow-x-auto p-5 font-mono text-[13px] leading-6">
        <span className="text-muted-foreground">{'  locales/de.json\n'}</span>
        <span>{'  "checkout": {\n'}</span>
        <span className="block bg-[var(--tomato-3)] text-[var(--tomato-11)]">
          {'-   "title": "Checkout"\n'}
        </span>
        <span className="block bg-[var(--jade-3)] text-[var(--jade-11)]">{'+   "title": "Zur Kasse"\n'}</span>
        <span className="block bg-[var(--jade-3)] text-[var(--jade-11)]">
          {'+   "items_one": "{{count}} Artikel",\n'}
        </span>
        <span className="block bg-[var(--jade-3)] text-[var(--jade-11)]">
          {'+   "items_other": "{{count}} Artikel"\n'}
        </span>
        <span>{'  }'}</span>
      </pre>
    </div>
  )
}
