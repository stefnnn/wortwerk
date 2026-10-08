import { readdir } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
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
const formatOf = (name: string): FileMapping['format'] | null => {
  const ext = name.split('.').pop()?.toLowerCase()
  if (ext === 'json') return 'json'
  if (ext === 'yml' || ext === 'yaml') return 'yaml'
  if (ext === 'po') return 'po'
  if (ext && ['ts', 'js', 'mjs', 'mts'].includes(ext)) return 'script'
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
export async function detectPatterns(root: string, sourceLocale: string) {
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
  return [...patterns]
    .filter(([, locales]) => locales.has(sourceLocale))
    .map(([path, locales]) => ({ path, format: formatOf(path)!, locales: [...locales].sort() }))
    .sort((a, b) => b.locales.length - a.locales.length || a.path.localeCompare(b.path))
}
