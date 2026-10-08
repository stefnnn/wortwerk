import { Link } from '@tanstack/react-router'
import { Download, LockOpen } from 'lucide-react'
import { inlineMarkdown } from '#/lib/docs.ts'
import {
  apiBase,
  curlExample,
  endpointsByTag,
  example,
  typeLabel,
  variants,
  type ApiSpec,
  type Endpoint,
  type Schema,
} from '#/lib/api-spec.ts'
import { cn } from '#/lib/utils.ts'
import { m } from '#/paraglide/messages.js'
import { DocsLayout, reference, useProseEvents } from './layout.tsx'

const methodClass: Record<string, string> = {
  GET: 'bg-[var(--jade-3)] text-[var(--jade-11)]',
  POST: 'bg-[var(--amber-3)] text-[var(--amber-11)]',
  PUT: 'bg-[var(--sage-4)] text-[var(--sage-12)]',
  PATCH: 'bg-[var(--sage-4)] text-[var(--sage-12)]',
  DELETE: 'bg-[var(--tomato-3)] text-[var(--tomato-11)]',
}

function Method({ method }: { method: string }) {
  return (
    <span
      className={cn(
        'inline-flex w-16 shrink-0 justify-center rounded-md px-1.5 py-0.5 font-mono text-xs font-semibold',
        methodClass[method],
      )}
    >
      {method}
    </span>
  )
}

function Markdown({ text, className }: { text?: string; className?: string }) {
  if (!text) return null
  return (
    <p className={cn('docs-inline', className)} dangerouslySetInnerHTML={{ __html: inlineMarkdown(text) }} />
  )
}

function objectOf(schema: Schema): Schema | null {
  const s = variants(schema).options[0] ?? schema
  if (s.properties) return s
  if (s.items) return objectOf(s.items)
  return null
}

function Properties({ schema, depth = 0 }: { schema: Schema; depth?: number }) {
  const object = objectOf(schema)
  if (!object?.properties) return null
  const required = new Set(object.required ?? [])
  return (
    <ul className={cn('divide-y', depth === 0 ? 'rounded-lg border' : 'mt-2 border-l pl-4')}>
      {Object.entries(object.properties).map(([name, prop]) => (
        <li key={name} className={depth === 0 ? 'px-4 py-3' : 'py-2'}>
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <code className="text-foreground font-mono text-sm font-medium">{name}</code>
            <span className="text-muted-foreground font-mono text-xs">{typeLabel(prop)}</span>
            {required.has(name) && (
              <span className="text-xs font-medium text-[var(--amber-11)]">{m.docs_required()}</span>
            )}
            {variants(prop).options[0]?.default !== undefined && (
              <span className="text-muted-foreground text-xs">
                {m.docs_default()} <code>{JSON.stringify(variants(prop).options[0]!.default)}</code>
              </span>
            )}
          </div>
          <Markdown text={prop.description} className="text-muted-foreground mt-1 text-sm" />
          {depth < 3 && objectOf(prop) && <Properties schema={prop} depth={depth + 1} />}
        </li>
      ))}
    </ul>
  )
}

function Parameters({ endpoint }: { endpoint: Endpoint }) {
  const params = endpoint.op.parameters ?? []
  if (!params.length) return null
  return (
    <div>
      <h4 className="mb-2 text-sm font-semibold">{m.docs_parameters()}</h4>
      <ul className="divide-y rounded-lg border">
        {params.map((p) => (
          <li key={`${p.in}-${p.name}`} className="px-4 py-3">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <code className="font-mono text-sm font-medium">{p.name}</code>
              <span className="text-muted-foreground font-mono text-xs">
                {p.schema ? typeLabel(p.schema) : 'string'}
              </span>
              <span className="bg-muted text-muted-foreground rounded px-1.5 text-xs">{p.in}</span>
              {p.required && (
                <span className="text-xs font-medium text-[var(--amber-11)]">{m.docs_required()}</span>
              )}
            </div>
            <Markdown
              text={p.description ?? p.schema?.description}
              className="text-muted-foreground mt-1 text-sm"
            />
          </li>
        ))}
      </ul>
    </div>
  )
}

function Code({ title, children }: { title: string; children: string }) {
  return (
    <div className="docs-code">
      <div className="docs-code-bar">
        <span>{title}</span>
        <button type="button" data-copy>
          Copy
        </button>
      </div>
      <pre>
        <code>{children}</code>
      </pre>
    </div>
  )
}

function EndpointView({ endpoint }: { endpoint: Endpoint }) {
  const { op } = endpoint
  const body = op.requestBody?.content ?? {}
  const jsonBody = body['application/json']?.schema
  const responses = Object.entries(op.responses ?? {}).sort(([a], [b]) => a.localeCompare(b))
  const success = responses.find(([status]) => status.startsWith('2'))
  const successSchema = success?.[1].content?.['application/json']?.schema
  const successType = success && Object.keys(success[1].content ?? {})[0]
  return (
    <article id={endpoint.id} className="scroll-mt-6 border-t py-10">
      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
        <div className="grid min-w-0 content-start gap-6">
          <div>
            <h3 className="text-xl font-semibold tracking-tight">
              <a href={`#${endpoint.id}`}>{op.summary}</a>
            </h3>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Method method={endpoint.method} />
              <code className="font-mono text-sm break-all">{endpoint.path}</code>
              {op.security?.length === 0 && (
                <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
                  <LockOpen className="size-3.5" /> {m.docs_no_token()}
                </span>
              )}
            </div>
            <Markdown text={op.description} className="text-muted-foreground mt-3 text-sm leading-relaxed" />
          </div>
          <Parameters endpoint={endpoint} />
          {jsonBody && objectOf(jsonBody) && (
            <div>
              <h4 className="mb-2 text-sm font-semibold">{m.docs_request_body()}</h4>
              <Properties schema={jsonBody} />
            </div>
          )}
          {body['application/octet-stream'] && (
            <div>
              <h4 className="mb-2 text-sm font-semibold">{m.docs_request_body()}</h4>
              <p className="text-muted-foreground text-sm">{m.docs_raw_body()}</p>
            </div>
          )}
          <div>
            <h4 className="mb-2 text-sm font-semibold">{m.docs_responses()}</h4>
            <ul className="divide-y rounded-lg border">
              {responses.map(([status, response]) => {
                const schema = response.content?.['application/json']?.schema
                const ok = status.startsWith('2')
                return (
                  <li key={status} className="px-4 py-3">
                    <details open={ok && Boolean(schema && objectOf(schema))} className="group">
                      <summary className="flex cursor-pointer list-none items-baseline gap-3 text-sm">
                        <code
                          className={cn(
                            'font-mono text-xs font-semibold',
                            ok ? 'text-[var(--jade-11)]' : 'text-[var(--tomato-11)]',
                          )}
                        >
                          {status}
                        </code>
                        <Markdown text={response.description} className="text-muted-foreground" />
                      </summary>
                      {schema && objectOf(schema) && (
                        <div className="mt-3">
                          <Properties schema={schema} depth={1} />
                        </div>
                      )}
                    </details>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
        <div className="grid min-w-0 content-start gap-4 xl:sticky xl:top-6 xl:self-start">
          <Code title="curl">{curlExample(endpoint)}</Code>
          {successSchema ? (
            <Code title={`${success![0]} response`}>{JSON.stringify(example(successSchema), null, 2)}</Code>
          ) : (
            successType && <Code title={`${success![0]} response`}>{`# ${successType}`}</Code>
          )}
        </div>
      </div>
    </article>
  )
}

export function ApiReference({ spec }: { spec: ApiSpec }) {
  const ref = useProseEvents()
  const groups = endpointsByTag(spec)
  return (
    <DocsLayout active={reference} wide>
      <div ref={ref}>
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">{m.docs_api_reference()}</h1>
        <p className="text-muted-foreground mt-3 max-w-3xl text-lg text-pretty">
          {m.docs_api_reference_lead()}
        </p>
        <dl className="mt-8 grid gap-4 rounded-xl border p-5 text-sm sm:grid-cols-[auto_1fr] sm:gap-x-8">
          <dt className="font-medium">{m.docs_base_url()}</dt>
          <dd>
            <code className="font-mono">{apiBase}</code>
          </dd>
          <dt className="font-medium">{m.docs_authentication()}</dt>
          <dd className="text-muted-foreground">
            <code className="text-foreground font-mono">Authorization: Bearer &lt;token&gt;</code> ·{' '}
            <Link
              to="/docs/$slug"
              params={{ slug: 'api' }}
              hash="tokens"
              className="text-primary hover:underline"
            >
              {m.docs_tokens_link()}
            </Link>
          </dd>
          <dt className="font-medium">OpenAPI</dt>
          <dd>
            <a
              href="/api/v1/openapi.json"
              className="text-primary inline-flex items-center gap-1.5 hover:underline"
            >
              <Download className="size-3.5" /> openapi.json
            </a>
            <span className="text-muted-foreground"> · OpenAPI 3.1, {spec.info.version}</span>
          </dd>
        </dl>
        <nav className="mt-8 flex flex-wrap gap-2">
          {groups.map(([tag]) => (
            <a
              key={tag}
              href={`#tag-${tag.toLowerCase()}`}
              className="hover:border-primary rounded-full border px-3 py-1 text-sm transition-colors"
            >
              {tag}
            </a>
          ))}
        </nav>
        {groups.map(([tag, endpoints]) => (
          <section key={tag} id={`tag-${tag.toLowerCase()}`} className="mt-14 scroll-mt-6">
            <h2 className="text-2xl font-semibold tracking-tight">{tag}</h2>
            <ul className="mt-4 mb-2 grid gap-1.5">
              {endpoints.map((e) => (
                <li key={e.id}>
                  <a href={`#${e.id}`} className="group flex items-center gap-3 text-sm">
                    <Method method={e.method} />
                    <code className="group-hover:text-primary font-mono transition-colors">{e.path}</code>
                    <span className="text-muted-foreground hidden truncate sm:inline">{e.op.summary}</span>
                  </a>
                </li>
              ))}
            </ul>
            {endpoints.map((e) => (
              <EndpointView key={e.id} endpoint={e} />
            ))}
          </section>
        ))}
      </div>
    </DocsLayout>
  )
}
