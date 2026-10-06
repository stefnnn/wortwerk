import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import {
  ArrowRight,
  Check,
  FileCode2,
  GitPullRequest,
  History,
  Languages,
  MessageSquare,
  Sparkles,
  Terminal,
} from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { GeometricBackground } from '#/components/marketing/background.tsx'
import { Faq, faqJsonLd } from '#/components/marketing/faq.tsx'
import { BitbucketLogo, GitHubLogo, StackChip, formats, frameworks } from '#/components/marketing/logos.tsx'
import { ProcessSteps } from '#/components/marketing/process.tsx'
import { MarketingLayout } from '#/components/marketing/site.tsx'
import { buttonVariants } from '#/components/ui/button.tsx'
import { authClient } from '#/lib/auth-client.ts'
import { formatNumber } from '#/lib/format.ts'
import { cn } from '#/lib/utils.ts'
import { planIds, plans, type Plan } from '@wortwerk/core/plans'
import { m } from '#/paraglide/messages.js'

export const Route = createFileRoute('/')({
  head: () => ({
    meta: [
      { title: `wortwerk — ${m.landing_title()}` },
      { name: 'description', content: m.landing_subtitle() },
    ],
    scripts: [{ type: 'application/ld+json', children: faqJsonLd() }],
  }),
  component: Landing,
})

function Landing() {
  const navigate = useNavigate()
  useEffect(() => {
    authClient.getSession().then(({ data }) => {
      if (data) navigate({ to: '/app', replace: true })
    })
  }, [navigate])

  const features = [
    { icon: GitPullRequest, title: m.feature_git_title(), body: m.feature_git_body() },
    { icon: FileCode2, title: m.feature_formats_title(), body: m.feature_formats_body() },
    { icon: Languages, title: m.feature_icu_title(), body: m.feature_icu_body() },
    { icon: History, title: m.feature_history_title(), body: m.feature_history_body() },
    { icon: MessageSquare, title: m.feature_context_title(), body: m.feature_context_body() },
    { icon: Sparkles, title: m.feature_mt_title(), body: m.feature_mt_body() },
  ]

  return (
    <MarketingLayout>
      <section className="relative isolate">
        <GeometricBackground />
        <div className="mx-auto max-w-6xl px-6 pt-16 pb-20 md:pt-28">
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
            <a
              href="#how"
              className={buttonVariants({ size: 'lg', variant: 'outline', className: 'bg-background' })}
            >
              {m.cta_how_it_works()}
            </a>
          </div>
          <CodePreview />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-20">
        <p className="text-muted-foreground text-center text-sm">{m.stack_title()}</p>
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {frameworks.map((item) => (
            <StackChip key={item.name} item={item} />
          ))}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {formats.map((item) => (
            <StackChip key={item.name} item={item} />
          ))}
        </div>
      </section>

      <section id="how" className="bg-card/60 scroll-mt-4 border-y">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <SectionTitle title={m.process_title()} body={m.process_subtitle()} />
          <div className="mt-12">
            <ProcessSteps />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-24">
        <SectionTitle title={m.integrations_title()} body={m.integrations_subtitle()} />
        <div className="mt-12 grid gap-6 md:grid-cols-2">
          <IntegrationCard
            logo={<GitHubLogo className="size-9" />}
            name="GitHub"
            body={m.integrations_github_body()}
            items={[m.integrations_github_1(), m.integrations_github_2(), m.integrations_github_3()]}
          />
          <IntegrationCard
            logo={<BitbucketLogo className="size-9 text-[#2684ff]" />}
            name="Bitbucket Cloud"
            body={m.integrations_bitbucket_body()}
            items={[m.integrations_bitbucket_1(), m.integrations_bitbucket_2(), m.integrations_bitbucket_3()]}
          />
        </div>
        <p className="text-muted-foreground mt-6 flex items-center gap-2 text-sm">
          <Terminal className="size-4 shrink-0" /> {m.integrations_ci()}
        </p>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-24">
        <SectionTitle title={m.features_title()} />
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

      <section id="pricing" className="mx-auto max-w-6xl scroll-mt-4 px-6 pb-24">
        <SectionTitle title={m.pricing_title()} />
        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          {planIds.map((id) => (
            <PlanCard key={id} plan={plans[id]} highlight={id === 'agency'} />
          ))}
        </div>
      </section>

      <section
        id="faq"
        className="mx-auto grid max-w-6xl scroll-mt-4 gap-10 px-6 pb-28 lg:grid-cols-[1fr_2fr]"
      >
        <SectionTitle title={m.faq_title()} body={m.faq_subtitle()} />
        <Faq />
      </section>
    </MarketingLayout>
  )
}

function SectionTitle({ title, body }: { title: string; body?: string }) {
  return (
    <div className="max-w-2xl">
      <h2 className="text-3xl font-semibold tracking-tight text-balance">{title}</h2>
      {body && <p className="text-muted-foreground mt-3 text-pretty">{body}</p>}
    </div>
  )
}

function IntegrationCard({
  logo,
  name,
  body,
  items,
}: {
  logo: ReactNode
  name: string
  body: string
  items: string[]
}) {
  return (
    <div className="bg-card rounded-xl border p-8">
      <div className="flex items-center gap-4">
        {logo}
        <h3 className="text-xl font-semibold tracking-tight">{name}</h3>
      </div>
      <p className="text-muted-foreground mt-4 text-pretty">{body}</p>
      <ul className="mt-6 space-y-3 text-sm">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <Check className="text-primary size-4 shrink-0" /> {item}
          </li>
        ))}
      </ul>
    </div>
  )
}

const planNames = { free: 'Free', project: 'Project', agency: 'Agency' } as const

function PlanCard({ plan, highlight }: { plan: Plan; highlight?: boolean }) {
  const items = [
    plan.maxProjects === null
      ? m.pricing_projects_unlimited()
      : m.pricing_projects({ count: formatNumber(plan.maxProjects) }),
    m.pricing_keys({ count: formatNumber(plan.maxKeys) }),
    plan.maxMembers === 1
      ? m.pricing_users_one()
      : m.pricing_users({ count: formatNumber(plan.maxMembers ?? 0) }),
    m.pricing_git(),
    ...(plan.machineTranslation ? [m.pricing_mt()] : []),
  ]
  return (
    <div
      className={cn(
        'flex flex-col rounded-xl border bg-card p-8',
        highlight && 'border-primary ring-1 ring-primary',
      )}
    >
      <h3 className="font-medium">{planNames[plan.id]}</h3>
      <p className="mt-2 text-3xl font-semibold tracking-tight">
        {m.pricing_price({ price: formatNumber(plan.priceChfPerYear) })}
        {plan.priceChfPerYear > 0 && (
          <span className="text-muted-foreground text-base font-normal"> {m.pricing_per_year()}</span>
        )}
      </p>
      <ul className="mt-6 mb-8 space-y-3 text-sm">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <Check className="text-primary size-4 shrink-0" /> {item}
          </li>
        ))}
      </ul>
      <Link
        to="/sign-up"
        className={cn(buttonVariants({ variant: highlight ? 'default' : 'outline' }), 'mt-auto w-full')}
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
