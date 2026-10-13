import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { MarketingLayout, PageHeading } from '#/components/marketing/site.tsx'
import { competitors } from '#/lib/compare.ts'
import { m } from '#/paraglide/messages.js'
import { getLocale } from '#/paraglide/runtime.js'

export const Route = createFileRoute('/compare/')({
  head: () => ({
    meta: [
      { title: `wortwerk — ${m.compare_index_title()}` },
      { name: 'description', content: m.compare_index_body() },
    ],
  }),
  component: CompareIndex,
})

function CompareIndex() {
  const de = getLocale() === 'de'
  return (
    <MarketingLayout>
      <PageHeading kicker={m.compare_kicker()} title={m.compare_index_title()}>
        <p>{m.compare_index_body()}</p>
      </PageHeading>
      <section className="mx-auto grid max-w-3xl gap-4 px-6 pb-20 sm:grid-cols-2">
        {competitors.map((c) => (
          <Link
            key={c.slug}
            to="/compare/$slug"
            params={{ slug: c.slug }}
            className="group bg-card rounded-xl border p-5 transition-colors hover:border-[var(--jade-7)]"
          >
            <h2 className="flex items-center justify-between font-medium">
              wortwerk vs. {c.name}
              <ArrowRight className="text-muted-foreground group-hover:text-primary size-4 transition-colors" />
            </h2>
            <p className="text-muted-foreground mt-2 line-clamp-3 text-sm">
              {de ? c.summary.de : c.summary.en}
            </p>
          </Link>
        ))}
      </section>
    </MarketingLayout>
  )
}
