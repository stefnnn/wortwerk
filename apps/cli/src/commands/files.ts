import { defineCommand } from 'citty'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { CliError, failure, projectSession, unwrap } from '../client.ts'
import { localPath } from '../config.ts'
import { fetchProject, syncConfig } from '../project.ts'
import { c, log, plural, waitForRuns } from '../ui.ts'

const localeList = (value: string | undefined) => value?.split(/[\s,]+/).filter(Boolean)

export const pull = defineCommand({
  meta: { name: 'pull', description: 'Download translation files into this folder' },
  args: {
    locale: { type: 'string', alias: 'l', description: 'Only these locales (comma separated)' },
    source: { type: 'boolean', description: 'Also download the source locale' },
  },
  async run({ args }) {
    const { root, path, client, config } = await projectSession()
    const project = await fetchProject(client, config.project)
    const synced = await syncConfig(path, project, client.host)
    if (!project.files.length)
      throw new CliError('The project has no files yet. Add a file pattern with `wortwerk init`.')

    const targets = project.locales.filter((l) => l !== project.sourceLocale)
    const locales = localeList(args.locale) ?? (args.source ? project.locales : targets)
    const unknown = locales.filter((l) => !project.locales.includes(l))
    if (unknown.length) throw new CliError(`Unknown locale: ${unknown.join(', ')}`)

    let changed = 0
    let unchanged = 0
    for (const file of project.files) {
      for (const locale of locales) {
        const res = await client.raw(
          `/projects/${project.id}/files/${file.id}/download?locale=${encodeURIComponent(locale)}`,
        )
        if (!res.ok) throw await failure(res)
        const content = await res.text()
        const relative = res.headers.get('x-wortwerk-path') ?? localPath(synced, file.path, locale)
        const target = join(root, relative)
        const before = await readFile(target, 'utf8').catch(() => null)
        if (before === content) {
          unchanged++
          continue
        }
        await mkdir(dirname(target), { recursive: true })
        await writeFile(target, content)
        changed++
        log.step(`${before === null ? c.green('created') : c.cyan('updated')} ${relative}`)
      }
    }
    log.success(`${plural(changed, 'file')} written${unchanged ? c.dim(`, ${unchanged} unchanged`) : ''}`)
  },
})

export const push = defineCommand({
  meta: {
    name: 'push',
    description: 'Upload local files: the source by default, translations with --locale',
  },
  args: {
    locale: {
      type: 'string',
      alias: 'l',
      description: 'Locales to upload (comma separated, default: source)',
    },
    overwrite: { type: 'boolean', description: 'Replace translations that differ in wortwerk' },
    wait: {
      type: 'boolean',
      default: true,
      description: 'Wait for the imports to finish',
      negativeDescription: 'Return once queued',
    },
  },
  async run({ args }) {
    const { root, path, client, config } = await projectSession()
    const project = await fetchProject(client, config.project)
    const synced = await syncConfig(path, project, client.host)
    const locales = localeList(args.locale) ?? [project.sourceLocale]
    if (project.repo && locales.includes(project.sourceLocale))
      throw new CliError(
        `Source files come from ${project.repo.repo}. Commit them there and run \`wortwerk sync\`, or push translations with --locale.`,
      )

    const runs = []
    for (const file of project.files) {
      for (const locale of locales) {
        const relative = localPath(synced, file.path, locale)
        const content = await readFile(join(root, relative)).catch(() => null)
        if (!content) {
          log.warn(`${relative} not found, skipped`)
          continue
        }
        const res = await client.raw(
          `/projects/${project.id}/files/${file.id}/import?locale=${encodeURIComponent(locale)}&overwrite=${args.overwrite ? 'true' : 'false'}`,
          { method: 'POST', body: content, headers: { 'content-type': 'application/octet-stream' } },
        )
        if (!res.ok) throw await failure(res)
        runs.push((await res.json()) as { id: string; kind: string; status: string })
        log.step(`uploaded ${relative}`)
      }
    }
    if (!runs.length) throw new CliError('No files to upload')
    if (!args.wait) return log.success(`${plural(runs.length, 'import')} queued`)
    if (!(await waitForRuns(client, project.id, runs))) process.exitCode = 1
  },
})

export const sync = defineCommand({
  meta: { name: 'sync', description: 'Pull the repository into wortwerk, optionally export a PR afterwards' },
  args: {
    export: { type: 'boolean', description: 'Open or update the translations PR afterwards' },
    wait: {
      type: 'boolean',
      default: true,
      description: 'Wait for the runs to finish',
      negativeDescription: 'Return once queued',
    },
  },
  async run({ args }) {
    const { client, config } = await projectSession()
    const projectId = config.project
    const { runs } = await unwrap(
      client.api.projects[':projectId'].sync.$post({
        param: { projectId },
        json: { export: Boolean(args.export) },
      }),
    )
    if (!args.wait) return log.success(`${plural(runs.length, 'run')} queued`)
    if (!(await waitForRuns(client, projectId, runs))) process.exitCode = 1
  },
})

export const mt = defineCommand({
  meta: { name: 'mt', description: 'Machine-translate every untranslated key of a locale' },
  args: {
    locale: { type: 'positional', description: 'Target locale', required: true },
    wait: {
      type: 'boolean',
      default: true,
      description: 'Wait for the run to finish',
      negativeDescription: 'Return once queued',
    },
  },
  async run({ args }) {
    const { client, config } = await projectSession()
    const run = await unwrap(
      client.api.projects[':projectId'].machine.$post({
        param: { projectId: config.project },
        json: { locale: args.locale },
      }),
    )
    if (!args.wait) return log.success('Machine translation queued')
    if (!(await waitForRuns(client, config.project, [run]))) process.exitCode = 1
  },
})
