import { createServerFn } from '@tanstack/react-start'

export type Schema = {
  type?: string | string[]
  properties?: Record<string, Schema>
  required?: string[]
  items?: Schema
  anyOf?: Schema[]
  enum?: unknown[]
  default?: unknown
  description?: string
  format?: string
  pattern?: string
  minLength?: number
  maxLength?: number
  minimum?: number
  maximum?: number
  additionalProperties?: Schema | boolean
}

type Content = Record<string, { schema?: Schema }>

export type Operation = {
  operationId?: string
  tags?: string[]
  summary?: string
  description?: string
  security?: unknown[]
  parameters?: Array<{ name: string; in: string; required?: boolean; description?: string; schema?: Schema }>
  requestBody?: { content?: Content }
  responses?: Record<string, { description?: string; content?: Content }>
}

export type ApiSpec = {
  info: { title: string; version: string; description?: string }
  paths: Record<string, Record<string, Operation>>
}

const specJson = createServerFn({ method: 'GET' }).handler(async () => {
  const { openApiDocument } = await import('@wortwerk/api')
  const { info, paths } = await openApiDocument()
  return JSON.stringify({ info, paths })
})

export const getApiSpec = async () => JSON.parse(await specJson()) as ApiSpec

export const apiBase = 'https://wortwerk.li/api/v1'
export const tagOrder = ['Auth', 'Workspaces', 'Projects', 'Files', 'Keys', 'Sync']

export type Endpoint = { id: string; method: string; path: string; op: Operation }

export function endpointsByTag(spec: ApiSpec) {
  const groups = new Map<string, Endpoint[]>()
  for (const [path, methods] of Object.entries(spec.paths)) {
    for (const [method, op] of Object.entries(methods)) {
      const tag = op.tags?.[0] ?? 'Other'
      const id = `${method}-${path}`
        .replace(/[{}]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, '-')
        .replace(/-+$/, '')
      groups.set(tag, [...(groups.get(tag) ?? []), { id, method: method.toUpperCase(), path, op }])
    }
  }
  return [...groups].sort(([a], [b]) => {
    const ia = tagOrder.indexOf(a)
    const ib = tagOrder.indexOf(b)
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
  })
}

export function variants(schema: Schema) {
  const options = schema.anyOf ?? [schema]
  const nullable =
    options.some((o) => o.type === 'null') || (Array.isArray(schema.type) && schema.type.includes('null'))
  return { nullable, options: options.filter((o) => o.type !== 'null') }
}

export function typeLabel(schema: Schema): string {
  const { nullable, options } = variants(schema)
  const labels = options.map((o) => {
    if (o.enum) return o.enum.map((v) => JSON.stringify(v)).join(' | ')
    const type = Array.isArray(o.type) ? o.type.filter((t) => t !== 'null').join(' | ') : o.type
    if (type === 'array') return `${o.items ? typeLabel(o.items) : 'unknown'}[]`
    if (type === 'object' && !o.properties && o.additionalProperties) return 'map'
    return type ?? 'any'
  })
  return [...labels, ...(nullable ? ['null'] : [])].join(' | ')
}

const sampleStrings: Record<string, string> = {
  id: 'f3b1c6e2-…',
  name: 'Checkout',
  'user.name': 'Ada Lovelace',
  slug: 'checkout',
  locale: 'de',
  code: 'de',
  sourceLocale: 'en',
  path: 'locales/%locale%.json',
  value: 'Warenkorb',
  source: 'Cart',
  email: 'ada@example.com',
  token: 'wwu_…',
  deviceCode: 'Gk2v…',
  userCode: 'BCDF-GHJK',
  clientName: 'wortwerk CLI on laptop',
  role: 'owner',
  error: 'not_found',
  message: 'Project not found',
  nextCursor: 'MTAw',
}

export function example(schema: Schema | undefined, key = '', depth = 0): unknown {
  if (!schema || depth > 6) return null
  const { options } = variants(schema)
  const s = options[0] ?? schema
  if (s.default !== undefined) return s.default
  if (s.enum) return s.enum[0]
  const type = Array.isArray(s.type) ? s.type.find((t) => t !== 'null') : s.type
  if (type === 'object' || s.properties) {
    if (!s.properties) return {}
    return Object.fromEntries(
      Object.entries(s.properties).map(([k, v]) => [k, example(v, key ? `${key}.${k}` : k, depth + 1)]),
    )
  }
  if (type === 'array') return [example(s.items, key.replace(/s$/, ''), depth + 1)]
  if (type === 'boolean') return false
  if (type === 'number' || type === 'integer') return s.minimum ?? 0
  if (s.format === 'date-time' || /At$/.test(key)) return '2026-10-08T09:30:00.000Z'
  const match =
    sampleStrings[key] !== undefined
      ? key
      : Object.keys(sampleStrings)
          .filter((k) => key.toLowerCase().endsWith(k.toLowerCase()))
          .sort((a, b) => b.length - a.length)[0]
  return match ? sampleStrings[match] : key ? `…` : ''
}

export function curlExample(endpoint: Endpoint) {
  const { op, method, path } = endpoint
  const placeholder = (name: string) => `$${name.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase()}`
  let url = apiBase + path.replace(/\{(\w+)\}/g, (_, name: string) => placeholder(name))
  const query = (op.parameters ?? []).filter((p) => p.in === 'query' && p.required)
  if (query.length) url += `?${query.map((p) => `${p.name}=${String(example(p.schema, p.name))}`).join('&')}`
  const lines = [`curl${method === 'GET' ? '' : ` -X ${method}`} "${url}"`]
  if (op.security?.length !== 0) lines.push('-H "Authorization: Bearer $WORTWERK_TOKEN"')
  const body = op.requestBody?.content ?? {}
  if (body['application/json']) {
    lines.push('-H "Content-Type: application/json"')
    lines.push(`-d '${JSON.stringify(example(body['application/json'].schema))}'`)
  } else if (body['application/octet-stream']) {
    lines.push('--data-binary @locales/de.json')
  }
  return lines.join(' \\\n  ')
}
