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

async function walk(root: string, dir: string, depth: number, out: string[]) {
  if (depth > 6 || out.length > 5000) return
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!ignoredDirs.has(entry.name) && !entry.name.startsWith('.'))
        await walk(root, join(dir, entry.name), depth + 1, out)
    } else if (formatOf(entry.name)) out.push(relative(root, join(dir, entry.name)).split(sep).join('/'))
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

export async function detectPatterns(root: string, sourceLocale?: string): Promise<DetectedPattern[]> {
  const files: string[] = []
  await walk(root, root, 0, files)
  const localeLike = /^[a-z]{2,3}([-_][A-Za-z0-9]{2,8})?$/
  const patterns = new Map<string, Set<string>>()
  for (const file of files) {
    const parts = file.split('/')
    const name = parts.pop()!
    const stem = name.split('.')
    for (let i = 0; i < parts.length + stem.length - 1; i++) {
      const inDir = i < parts.length
      const value = inDir ? parts[i]! : stem[i - parts.length]!
      if (!localeLike.test(value)) continue
      const replaced = inDir
        ? [...parts.slice(0, i), '%locale%', ...parts.slice(i + 1), name].join('/')
        : [...parts, stem.map((s, j) => (j === i - parts.length ? '%locale%' : s)).join('.')].join('/')
      if (!patterns.has(replaced)) patterns.set(replaced, new Set())
      patterns.get(replaced)!.add(value)
    }
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
      const location = /(^|\/)(locales?|i18n|translations?|messages)(\/|$)/i.test(path)
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
  return found
    .filter((candidate) => !sourceLocale || candidate.locales.includes(sourceLocale))
    .sort((a, b) => b.locales.length - a.locales.length || a.path.localeCompare(b.path))
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
  const patterns = await detectPatterns(scanRoot)
  const locales = [...new Set(patterns.flatMap((item) => item.locales))].sort()
  const sourceLocale = locales.includes('en')
    ? 'en'
    : locales.toSorted((a, b) => {
        const count = (locale: string) => Math.max(...patterns.map((p) => p.keyCounts?.[locale] ?? 0))
        return count(b) - count(a)
      })[0]
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
