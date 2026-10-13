import { createFileRoute, notFound } from '@tanstack/react-router'
import { DocPage, docHead } from '#/components/docs/page.tsx'
import { loadDoc } from '#/lib/docs.ts'

export const Route = createFileRoute('/docs/')({
  loader: () => {
    const doc = loadDoc('index')
    if (!doc) throw notFound()
    return doc
  },
  head: ({ loaderData }) => docHead(loaderData),
  component: () => <DocPage doc={Route.useLoaderData()} />,
})
