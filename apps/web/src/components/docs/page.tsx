import type { Doc } from '#/lib/docs.ts'
import { DocsLayout, useProseEvents } from './layout.tsx'

export function DocPage({ doc }: { doc: Doc }) {
  const ref = useProseEvents()
  return (
    <DocsLayout active={doc.slug} headings={doc.headings} editPath={`${doc.locale}/${doc.slug}.md`}>
      <article>
        <h1 className="text-3xl font-semibold tracking-tight text-balance md:text-4xl">{doc.title}</h1>
        {doc.description && (
          <p className="text-muted-foreground mt-3 text-lg text-pretty">{doc.description}</p>
        )}
        <div ref={ref} className="docs-prose mt-8" dangerouslySetInnerHTML={{ __html: doc.html }} />
      </article>
    </DocsLayout>
  )
}

export function docHead(doc: Doc | undefined) {
  return {
    meta: doc
      ? [{ title: `${doc.title} · wortwerk docs` }, { name: 'description', content: doc.description }]
      : [],
  }
}
