import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

export const defaultHost = 'https://wortwerk.li'
export const projectConfigName = 'wortwerk.json'

export type Credentials = {
  host?: string
  hosts: Record<string, { token: string; email: string }>
}

export type FileMapping = { path: string; format: 'json' | 'yaml' | 'po' | 'script' }

// a cache of the project's shape so `lint` works offline, refreshed by init, pull and push
export type ProjectConfig = {
  project: string
  host?: string
  sourceLocale: string
  locales: string[]
  files: FileMapping[]
  localeAliases?: Record<string, string>
}

const configDir = () => join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'wortwerk')
export const credentialsPath = () => join(configDir(), 'credentials.json')

export function normalizeHost(url: string) {
  const parsed = new URL(url.includes('://') ? url : `https://${url}`)
  return parsed.origin
}

export async function readCredentials(): Promise<Credentials> {
  try {
    return JSON.parse(await readFile(credentialsPath(), 'utf8')) as Credentials
  } catch {
    return { hosts: {} }
  }
}

export async function saveCredentials(credentials: Credentials) {
  const path = credentialsPath()
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  await writeFile(path, `${JSON.stringify(credentials, null, 2)}\n`, { mode: 0o600 })
  await chmod(path, 0o600)
}

export async function findProjectConfig(from = process.cwd()) {
  let dir = resolve(from)
  while (true) {
    const path = join(dir, projectConfigName)
    try {
      return { root: dir, path, config: JSON.parse(await readFile(path, 'utf8')) as ProjectConfig }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

export async function writeProjectConfig(path: string, config: ProjectConfig) {
  const { project, host, sourceLocale, locales, files, localeAliases } = config
  const ordered = {
    project,
    ...(host && host !== defaultHost ? { host } : {}),
    sourceLocale,
    locales,
    files,
    ...(localeAliases && Object.keys(localeAliases).length ? { localeAliases } : {}),
  }
  await writeFile(path, `${JSON.stringify(ordered, null, 2)}\n`)
}

export function localPath(config: Pick<ProjectConfig, 'localeAliases'>, pattern: string, locale: string) {
  return pattern.replaceAll('%locale%', config.localeAliases?.[locale] ?? locale)
}
