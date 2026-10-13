import { execFile } from 'node:child_process'
import { readFile, readdir } from 'node:fs/promises'
import { basename, join, relative, sep } from 'node:path'
import { promisify } from 'node:util'
import { parseFile } from '@wortwerk/formats'
import { unwrap, type Client } from './client.ts'
import { writeProjectConfig, type FileMapping, type ProjectConfig } from './config.ts'

export async function fetchProject(client: Client, projectId: string) {
  return unwrap(client.api.projects[':projectId'].$get({ param: { projectId } }))
}

export type Project = Awaited<ReturnType<typeof fetchProject>>

export async function syncConfig(path: string, project: Project, host: string) {
  const config: ProjectConfig = {
    project: project.id,
    host,
    sourceLocale: project.sourceLocale,
    locales: project.locales,
    files: project.files.map((f) => ({ path: f.path, format: f.format })),
    localeAliases: project.repo?.localeAliases,
  }
  await writeProjectConfig(path, config)
  return config
}

const ignoredDirs = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  '.next',
  '.nuxt',
  '.output',
  '.svelte-kit',
  '.turbo',
  'coverage',
  'vendor',
  'tmp',
])
export const formatOf = (name: string): FileMapping['format'] | null => {
  const ext = name.split('.').pop()?.toLowerCase()
  if (ext === 'json') return 'json'
  if (ext === 'yml' || ext === 'yaml') return 'yaml'
  if (ext === 'po' || ext === 'pot') return 'po'
  if (ext && ['ts', 'js', 'mjs', 'mts', 'cjs', 'cts'].includes(ext)) return 'script'
  return null
}

// Tooling files that share an extension with translation files but never hold messages.
const toolingFile =
  /^(package(-lock)?|tsconfig[^/]*|jsconfig[^/]*|composer|deno|biome)\.json$|\.(config|gen|generated|d|test|spec|stories)\.[a-z]+$/i

async function walk(root: string, dir: string, depth: number, out: string[]) {
  if (depth > 6 || out.length > 5000) return
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!ignoredDirs.has(entry.name) && !entry.name.startsWith('.'))
        await walk(root, join(dir, entry.name), depth + 1, out)
    } else if (formatOf(entry.name) && !toolingFile.test(entry.name))
      out.push(relative(root, join(dir, entry.name)).split(sep).join('/'))
  }
}

/**
 * Finds translation files by locale: a `locale` folder (`locales/en/app.json`) or a file named after it
 * (`en.json`, `messages.en.yml`). Returns `%locale%` patterns with the other locales seen for each.
 */
const canonicalLocale = (value: string) =>
  value
    .replaceAll('_', '-')
    .split('-')
    .map((part, index) => (index === 0 ? part.toLowerCase() : part.length === 2 ? part.toUpperCase() : part))
    .join('-')

export type DetectedPattern = {
  path: string
  format: FileMapping['format']
  locales: string[]
  confidence: number
  keyCounts?: Record<string, number>
  localeAliases?: Record<string, string>
}

// Three-letter codes are only trusted for languages without a two-letter code: `src` (Sardinian) or `lib`
// would otherwise match every source folder.
const threeLetterLanguages = new Set(['fil', 'yue', 'ast', 'haw', 'ceb', 'kab', 'gsw', 'hsb', 'dsb'])
const languageNames = new Intl.DisplayNames(['en'], { type: 'language', fallback: 'none' })
const localeShape = /^([a-z]{2,3})([-_](?:[A-Za-z]{4}|[A-Za-z]{2}|\d{3}))*$/

/** A real language code (optionally with script / region), not just a short word like `api` or `app`. */
export function isLocaleCode(value: string) {
  const match = localeShape.exec(value)
  if (!match) return false
  const language = match[1]!
  if (language.length === 3 && !threeLetterLanguages.has(language)) return false
  try {
    return languageNames.of(canonicalLocale(value)) !== undefined
  } catch {
    return false
  }
}

const i18nLocation = /(^|\/)(locales?|i18n|l10n|lang|languages|translations?|messages)(\/|$)/i

export async function detectPatterns(root: string, sourceLocale?: string): Promise<DetectedPattern[]> {
  const files: string[] = []
  await walk(root, root, 0, files)
  const patterns = new Map<string, Set<string>>()
  for (const file of files) {
    const parts = file.split('/')
    const name = parts.pop()!
    const stem = name.split('.')
    // One mapping per file: the innermost locale-like segment (`locales/en/app.json`, `web.en.ts`).
    let best: { replaced: string; value: string } | null = null
    for (let i = 0; i < parts.length + stem.length - 1; i++) {
      const inDir = i < parts.length
      const value = inDir ? parts[i]! : stem[i - parts.length]!
      if (!isLocaleCode(value)) continue
      const replaced = inDir
        ? [...parts.slice(0, i), '%locale%', ...parts.slice(i + 1), name].join('/')
        : [...parts, stem.map((s, j) => (j === i - parts.length ? '%locale%' : s)).join('.')].join('/')
      best = { replaced, value }
    }
    if (!best) continue
    // Source code is only a translation file inside a folder that says so.
    if (formatOf(file) === 'script' && !i18nLocation.test(best.replaced)) continue
    if (!patterns.has(best.replaced)) patterns.set(best.replaced, new Set())
    patterns.get(best.replaced)!.add(best.value)
  }
  const found = await Promise.all(
    [...patterns].map(async ([path, rawLocales]) => {
      const format = formatOf(path)!
      const locales = [...rawLocales].map(canonicalLocale)
      const localeAliases = Object.fromEntries(
        [...rawLocales]
          .map((raw) => [canonicalLocale(raw), raw] as const)
          .filter(([canonical, raw]) => canonical !== raw),
      )
      const keyCounts: Record<string, number> = {}
      let parsed = 0
      for (const raw of rawLocales) {
        try {
          const content = await readFile(join(root, path.replaceAll('%locale%', raw)), 'utf8')
          keyCounts[canonicalLocale(raw)] = parseFile(format, content, {
            locale: canonicalLocale(raw),
            isSource: canonicalLocale(raw) === sourceLocale,
          }).entries.length
          parsed++
        } catch {
          // A filename can resemble a locale without being a supported translation file.
        }
      }
      const location = i18nLocation.test(path)
      const confidence = Math.min(
        1,
        0.25 + (rawLocales.size > 1 ? 0.3 : 0) + (location ? 0.25 : 0) + (parsed ? 0.2 : 0),
      )
      return {
        path,
        format,
        locales: [...new Set(locales)].sort(),
        confidence,
        ...(parsed ? { keyCounts } : {}),
        ...(Object.keys(localeAliases).length ? { localeAliases } : {}),
      }
    }),
  )
  return (
    found
      // Script files wortwerk cannot read (e.g. an `en.ts` that only re-exports `{ web: webEn }`) would fail every pull.
      .filter((candidate) => candidate.format !== 'script' || candidate.keyCounts)
      .filter((candidate) => !sourceLocale || candidate.locales.includes(sourceLocale))
      .sort(
        (a, b) =>
          b.confidence - a.confidence || b.locales.length - a.locales.length || a.path.localeCompare(b.path),
      )
  )
}

const runGit = promisify(execFile)

async function git(cwd: string, args: string[]) {
  return (await runGit('git', args, { cwd })).stdout.trim()
}

export function parseRemoteUrl(value: string) {
  const clean = value.trim()
  let host = ''
  let path = ''
  try {
    const url = new URL(clean)
    host = url.hostname.toLowerCase()
    path = url.pathname
  } catch {
    const match = /^(?:[^@]+@)?([^:]+):(.+)$/.exec(clean)
    if (!match) return null
    host = match[1]!.toLowerCase()
    path = match[2]!
  }
  const provider = host === 'github.com' ? 'github' : host === 'bitbucket.org' ? 'bitbucket' : null
  const repo = path.replace(/^\/+|\/+$/g, '').replace(/\.git$/, '')
  return provider && /^[\w.-]+\/[\w.-]+$/.test(repo) ? { provider, repo } : null
}

export async function discoverProject(root: string) {
  let gitRoot: string | undefined
  let remote: string | undefined
  let branch: string | undefined
  let repository: ReturnType<typeof parseRemoteUrl> = null
  try {
    gitRoot = await git(root, ['rev-parse', '--show-toplevel'])
    const localBranch = await git(root, ['symbolic-ref', '--quiet', '--short', 'HEAD']).catch(() => '')
    remote = localBranch
      ? await git(root, ['config', '--get', `branch.${localBranch}.remote`]).catch(() => '')
      : ''
    remote ||= await git(root, ['config', '--get', 'remote.pushDefault']).catch(() => '')
    const remotes = (await git(root, ['remote'])).split('\n').filter(Boolean)
    remote ||= remotes.includes('origin') ? 'origin' : remotes.length === 1 ? remotes[0] : undefined
    if (remote) {
      const url = await git(root, ['remote', 'get-url', '--push', remote]).catch(() => '')
      repository = parseRemoteUrl(url)
      const merge = localBranch
        ? await git(root, ['config', '--get', `branch.${localBranch}.merge`]).catch(() => '')
        : ''
      branch = merge.replace(/^refs\/heads\//, '') || undefined
    }
  } catch {
    // A folder without git is still a valid standalone wortwerk project.
  }
  const scanRoot = gitRoot ?? root
  const detected = await detectPatterns(scanRoot)
  const candidates = [...new Set(detected.flatMap((item) => item.locales))]
  const keyCount = (locale: string) => Math.max(...detected.map((p) => p.keyCounts?.[locale] ?? 0))
  const sourceLocale = candidates.includes('en')
    ? 'en'
    : candidates.toSorted((a, b) => keyCount(b) - keyCount(a))[0]
  // Patterns that do not carry the source locale cannot be mapped to a project.
  const patterns = detected.filter((p) => !sourceLocale || p.locales.includes(sourceLocale))
  const locales = [...new Set(patterns.flatMap((item) => item.locales))].sort()
  const localeAliases = Object.assign({}, ...patterns.map((item) => item.localeAliases ?? {}))
  return {
    root: scanRoot,
    name: basename(scanRoot),
    ...(repository && remote ? { git: { ...repository, remote, ...(branch ? { branch } : {}) } } : {}),
    patterns,
    locales,
    sourceLocale,
    localeAliases,
  }
}
