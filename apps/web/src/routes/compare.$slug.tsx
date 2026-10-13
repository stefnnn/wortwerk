import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import { ArrowRight, Check } from 'lucide-react'
import { Logo } from '#/components/brand.tsx'
import { MarketingLayout, PageHeading } from '#/components/marketing/site.tsx'
import { buttonVariants } from '#/components/ui/button.tsx'
import {
  compareRows,
  findCompetitor,
  wortwerkValues,
  type CompareRow,
  type Localized,
} from '#/lib/compare.ts'
import { m } from '#/paraglide/messages.js'
import { getLocale } from '#/paraglide/runtime.js'

export const Route = createFileRoute('/compare/$slug')({
  loader: ({ params }) => {
    const competitor = findCompetitor(params.slug)
    if (!competitor) throw notFound()
    return competitor
  },
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
          { title: `wortwerk vs. ${loaderData.name}` },
          { name: 'description', content: t(loaderData.summary) },
        ]
      : [],
  }),
  component: ComparePage,
})

function t(value: Localized) {
  return getLocale() === 'de' ? value.de : value.en
}

function ComparePage() {
  const competitor = Route.useLoaderData()
  const labels: Record<CompareRow, string> = {
    focus: m.compare_row_focus(),
    git: m.compare_row_git(),
    formats: m.compare_row_formats(),
    pricing: m.compare_row_pricing(),
    hosting: m.compare_row_hosting(),
    mt: m.compare_row_mt(),
    origin: m.compare_row_origin(),
  }

  return (
    <MarketingLayout>
      <PageHeading kicker={m.compare_kicker()} title={`wortwerk vs. ${competitor.name}`}>
        <p>{t(competitor.summary)}</p>
      </PageHeading>

      <section className="mx-auto max-w-5xl px-6">
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="w-1/5 px-4 py-3 font-medium" />
                <th className="w-2/5 px-4 py-3">
                  <Logo />
                </th>
                <th className="w-2/5 px-4 py-3 font-semibold">{competitor.name}</th>
              </tr>
            </thead>
            <tbody>
              {compareRows.map((row) => (
                <tr key={row} className="border-t align-top">
                  <th className="text-muted-foreground px-4 py-3 text-left font-normal">{labels[row]}</th>
                  <td className="bg-accent/30 px-4 py-3">{t(wortwerkValues[row])}</td>
                  <td className="px-4 py-3">{t(competitor.values[row])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mx-auto grid max-w-5xl gap-6 px-6 py-14 md:grid-cols-2">
        <ReasonList title={m.compare_choose_them({ name: competitor.name })} items={competitor.theyShine} />
        <ReasonList title={m.compare_choose_us()} items={competitor.weDiffer} highlight />
      </section>

      <section className="mx-auto max-w-5xl px-6 pb-20">
        <div className="bg-card flex flex-col items-start gap-5 rounded-xl border p-8 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">{m.compare_cta_title()}</h2>
            <p className="text-muted-foreground mt-1">{m.compare_cta_body()}</p>
          </div>
          <Link to="/sign-up" className={buttonVariants({ size: 'lg' })}>
            {m.cta_start_free()} <ArrowRight />
          </Link>
        </div>
        <p className="text-muted-foreground mt-8 text-xs">
          {m.compare_disclaimer({ name: competitor.name })}
        </p>
      </section>
    </MarketingLayout>
  )
}

function ReasonList({ title, items, highlight }: { title: string; items: Localized[]; highlight?: boolean }) {
  return (
    <div className={highlight ? 'border-primary rounded-xl border p-6' : 'rounded-xl border p-6'}>
      <h2 className="font-medium">{title}</h2>
      <ul className="mt-4 space-y-2.5 text-sm">
        {items.map((item) => (
          <li key={item.en} className="flex gap-2">
            <Check
              className={highlight ? 'text-primary size-4 shrink-0' : 'text-muted-foreground size-4 shrink-0'}
            />
            {t(item)}
          </li>
        ))}
      </ul>
    </div>
  )
}
