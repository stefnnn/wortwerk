import { createFileRoute } from '@tanstack/react-router'
import { ApiReference } from '#/components/docs/api-reference.tsx'
import { getApiSpec } from '#/lib/api-spec.ts'
import { m } from '#/paraglide/messages.js'

export const Route = createFileRoute('/docs/api/reference')({
  loader: () => getApiSpec(),
  staleTime: Infinity,
  head: () => ({
    meta: [
      { title: `${m.docs_api_reference()} · wortwerk docs` },
      { name: 'description', content: m.docs_api_reference_lead() },
    ],
  }),
  component: () => <ApiReference spec={Route.useLoaderData()} />,
})
