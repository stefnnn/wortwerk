import { Marked, type Tokens } from 'marked'
import { getLocale, localizeUrl } from '#/paraglide/runtime.js'
import { docSlugs } from './docs-nav.ts'

const files = import.meta.glob<string>('../content/docs/*/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
})

export type DocHeading = { id: string; text: string; level: number }
export type DocMeta = { slug: string; title: string; description: string; locale: string }
export type Doc = DocMeta & { html: string; headings: DocHeading[] }

function source(slug: string, locale: string) {
  const own = files[`../content/docs/${locale}/${slug}.md`]
  if (own) return { raw: own, locale }
  const fallback = files[`../content/docs/en/${slug}.md`]
  return fallback ? { raw: fallback, locale: 'en' } : null
}

function split(raw: string) {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(raw)
  const meta = Object.fromEntries(
    (match?.[1] ?? '')
      .split('\n')
      .map((line) => /^(\w+):\s*(.*)$/.exec(line))
      .filter((m): m is RegExpExecArray => Boolean(m))
      .map((m) => [m[1], m[2]!.trim()]),
  )
  return { meta, body: match ? raw.slice(match[0].length) : raw }
}

export function docMeta(slug: string, locale = getLocale()): DocMeta | null {
  if (!docSlugs.includes(slug)) return null
  const found = source(slug, locale)
  if (!found) return null
  const { meta } = split(found.raw)
  return { slug, title: meta.title ?? slug, description: meta.description ?? '', locale: found.locale }
}

const escape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const plain = (html: string) =>
  html
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")

export function localizePath(path: string, locale = getLocale()) {
  const url = localizeUrl(new URL(path, 'https://wortwerk.li'), { locale: locale as never })
  return url.pathname + url.search + url.hash
}

const cache = new Map<string, Doc>()

export function loadDoc(slug: string, locale = getLocale()): Doc | null {
  const key = `${locale}:${slug}`
  const cached = cache.get(key)
  if (cached) return cached
  const meta = docMeta(slug, locale)
  const found = source(slug, locale)
  if (!meta || !found) return null

  const headings: DocHeading[] = []
  const used = new Map<string, number>()
  const marked = new Marked({
    gfm: true,
    renderer: {
      heading({ tokens, depth }: Tokens.Heading) {
        const html = this.parser.parseInline(tokens)
        const text = plain(html)
        const base =
          text
            .toLowerCase()
            .replace(/[äöü]/g, (c) => ({ ä: 'ae', ö: 'oe', ü: 'ue' })[c]!)
            .normalize('NFKD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '') || 'section'
        const n = used.get(base) ?? 0
        used.set(base, n + 1)
        const id = n ? `${base}-${n}` : base
        if (depth === 2 || depth === 3) headings.push({ id, text, level: depth })
        return `<h${depth} id="${id}"><a class="docs-anchor" href="#${id}" aria-hidden="true">#</a>${html}</h${depth}>\n`
      },
      link({ href, title, tokens }: Tokens.Link) {
        const text = this.parser.parseInline(tokens)
        const titleAttr = title ? ` title="${escape(title)}"` : ''
        if (href.startsWith('/') && !href.startsWith('/api/'))
          return `<a href="${escape(localizePath(href, locale))}" data-internal="${escape(href)}"${titleAttr}>${text}</a>`
        if (href.startsWith('#')) return `<a href="${escape(href)}"${titleAttr}>${text}</a>`
        return `<a href="${escape(href)}"${titleAttr} target="_blank" rel="noreferrer">${text}</a>`
      },
      code({ text, lang }: Tokens.Code) {
        const label = lang ? `<span>${escape(lang)}</span>` : '<span></span>'
        return `<div class="docs-code"><div class="docs-code-bar">${label}<button type="button" data-copy>Copy</button></div><pre><code>${escape(text)}</code></pre></div>\n`
      },
      table(token: Tokens.Table) {
        const cell = (c: Tokens.TableCell, tag: string) =>
          `<${tag}>${this.parser.parseInline(c.tokens)}</${tag}>`
        const head = `<tr>${token.header.map((c) => cell(c, 'th')).join('')}</tr>`
        const rows = token.rows.map((r) => `<tr>${r.map((c) => cell(c, 'td')).join('')}</tr>`).join('')
        return `<div class="docs-table"><table><thead>${head}</thead><tbody>${rows}</tbody></table></div>\n`
      },
    },
  })
  const html = marked.parse(split(found.raw).body, { async: false })
  const doc = { ...meta, html, headings }
  cache.set(key, doc)
  return doc
}

export function inlineMarkdown(text: string) {
  return new Marked().parseInline(escape(text).replace(/&quot;/g, '"'), { async: false })
}
