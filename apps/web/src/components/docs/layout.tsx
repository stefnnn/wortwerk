import { Link, useRouter } from '@tanstack/react-router'
import { ArrowLeft, ArrowRight, BookOpen, ChevronDown, PencilLine } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'
import { toast } from 'sonner'
import { MarketingLayout } from '#/components/marketing/site.tsx'
import { docMeta, type DocHeading } from '#/lib/docs.ts'
import { docSlugs, docsSections, type DocSection } from '#/lib/docs-nav.ts'
import { cn } from '#/lib/utils.ts'
import { m } from '#/paraglide/messages.js'

const sectionTitle = (id: DocSection) =>
  ({
    start: m.docs_section_start(),
    repositories: m.docs_section_repositories(),
    tools: m.docs_section_tools(),
  })[id]

export const reference = 'api/reference'

function DocLink({ slug, active, children }: { slug: string; active: boolean; children: ReactNode }) {
  const className = cn(
    'block rounded-md px-2.5 py-1.5 text-sm transition-colors',
    active ? 'bg-accent text-accent-foreground font-medium' : 'text-muted-foreground hover:text-foreground',
  )
  if (slug === 'index')
    return (
      <Link to="/docs" activeOptions={{ exact: true }} className={className}>
        {children}
      </Link>
    )
  if (slug === reference)
    return (
      <Link to="/docs/api/reference" className={className}>
        {children}
      </Link>
    )
  return (
    <Link to="/docs/$slug" params={{ slug }} className={className}>
      {children}
    </Link>
  )
}

function Nav({ active }: { active: string }) {
  return (
    <nav className="grid gap-6">
      {docsSections.map((section) => (
        <div key={section.id}>
          <p className="mb-1.5 px-2.5 text-xs font-semibold tracking-wide uppercase">
            {sectionTitle(section.id)}
          </p>
          {section.pages.map((slug) => (
            <DocLink key={slug} slug={slug} active={active === slug}>
              {docMeta(slug)?.title}
            </DocLink>
          ))}
          {section.id === 'tools' && (
            <DocLink slug={reference} active={active === reference}>
              {m.docs_api_reference()}
            </DocLink>
          )}
        </div>
      ))}
    </nav>
  )
}

function Toc({ headings }: { headings: DocHeading[] }) {
  if (headings.length < 2) return null
  return (
    <nav className="text-sm">
      <p className="mb-2 font-medium">{m.docs_on_this_page()}</p>
      <ul className="grid gap-1.5">
        {headings.map((h) => (
          <li key={h.id} className={h.level === 3 ? 'pl-3' : undefined}>
            <a href={`#${h.id}`} className="text-muted-foreground hover:text-foreground transition-colors">
              {h.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}

function Pager({ active }: { active: string }) {
  const order = [...docSlugs, reference]
  const index = order.indexOf(active)
  const title = (slug: string) => (slug === reference ? m.docs_api_reference() : docMeta(slug)?.title)
  const prev = order[index - 1]
  const next = order[index + 1]
  return (
    <div className="mt-16 grid gap-4 border-t pt-6 sm:grid-cols-2">
      {prev ? (
        <DocLink slug={prev} active={false}>
          <span className="flex items-center gap-1.5 text-xs">
            <ArrowLeft className="size-3.5" /> {m.docs_previous()}
          </span>
          <span className="text-foreground mt-0.5 block font-medium">{title(prev)}</span>
        </DocLink>
      ) : (
        <span />
      )}
      {next && (
        <div className="sm:text-right">
          <DocLink slug={next} active={false}>
            <span className="flex items-center gap-1.5 text-xs sm:justify-end">
              {m.docs_next()} <ArrowRight className="size-3.5" />
            </span>
            <span className="text-foreground mt-0.5 block font-medium">{title(next)}</span>
          </DocLink>
        </div>
      )}
    </div>
  )
}

/** Copy buttons and client-side navigation for the rendered Markdown. */
export function useProseEvents() {
  const ref = useRef<HTMLDivElement>(null)
  const router = useRouter()
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      const copy = target.closest<HTMLButtonElement>('[data-copy]')
      if (copy) {
        const code = copy.closest('.docs-code')?.querySelector('code')?.textContent ?? ''
        void navigator.clipboard.writeText(code).then(() => toast.success(m.copied()))
        return
      }
      const link = target.closest<HTMLAnchorElement>('a[data-internal]')
      if (link && !event.metaKey && !event.ctrlKey && !event.shiftKey && event.button === 0) {
        event.preventDefault()
        void router.navigate({ href: link.dataset.internal! })
      }
    }
    el.addEventListener('click', onClick)
    return () => el.removeEventListener('click', onClick)
  }, [router])
  return ref
}

export function DocsLayout({
  active,
  headings = [],
  editPath,
  wide,
  children,
}: {
  active: string
  headings?: DocHeading[]
  editPath?: string
  wide?: boolean
  children: ReactNode
}) {
  return (
    <MarketingLayout>
      <div className="mx-auto w-full max-w-6xl px-6 pt-4 pb-20">
        <details className="group mb-6 rounded-lg border lg:hidden">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium">
            <BookOpen className="size-4" /> {m.docs_title()}
            <ChevronDown className="ml-auto size-4 transition-transform group-open:rotate-180" />
          </summary>
          <div className="border-t p-3">
            <Nav active={active} />
          </div>
        </details>
        <div
          className={cn(
            'grid gap-10 lg:grid-cols-[13rem_minmax(0,1fr)]',
            !wide && 'xl:grid-cols-[13rem_minmax(0,1fr)_12rem]',
          )}
        >
          <aside className="hidden lg:block">
            <div className="sticky top-6 max-h-[calc(100dvh-3rem)] overflow-y-auto pt-2">
              <Nav active={active} />
            </div>
          </aside>
          <div className="min-w-0 pt-2">
            {children}
            {editPath && (
              <a
                href={`https://github.com/stefnnn/wortwerk/blob/main/apps/web/src/content/docs/${editPath}`}
                className="text-muted-foreground hover:text-foreground mt-12 inline-flex items-center gap-1.5 text-sm"
                target="_blank"
                rel="noreferrer"
              >
                <PencilLine className="size-3.5" /> {m.docs_edit()}
              </a>
            )}
            <Pager active={active} />
          </div>
          {!wide && (
            <aside className="hidden xl:block">
              <div className="sticky top-6 pt-2">
                <Toc headings={headings} />
              </div>
            </aside>
          )}
        </div>
      </div>
    </MarketingLayout>
  )
}
