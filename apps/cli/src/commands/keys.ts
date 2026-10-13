import { defineCommand } from 'citty'
import { CliError, projectSession, unwrap, type Client } from '../client.ts'
import { fetchProject, type Project } from '../project.ts'
import { c, log, openBrowser, table } from '../ui.ts'

const statuses = ['untranslated', 'translated', 'needs_review', 'approved']
const statusColor: Record<string, (s: string) => string> = {
  untranslated: c.red,
  translated: c.cyan,
  needs_review: c.yellow,
  approved: c.green,
}

const clip = (value: string | null, width = 60) => {
  const flat = (value ?? '').replace(/\s+/g, ' ')
  return flat.length > width ? `${flat.slice(0, width - 1)}…` : flat
}

export const keys = defineCommand({
  meta: { name: 'keys', description: 'List or search keys' },
  args: {
    search: {
      type: 'positional',
      description: 'Search in key names, source and translations',
      required: false,
    },
    locale: { type: 'string', alias: 'l', description: 'Locale to show (default: first target locale)' },
    status: { type: 'enum', options: statuses, description: 'Only keys with this status' },
    limit: { type: 'string', default: '50', description: 'Maximum number of keys' },
    json: { type: 'boolean', description: 'Print JSON' },
  },
  async run({ args }) {
    const { client, config } = await projectSession()
    const project = await fetchProject(client, config.project)
    const locale =
      args.locale ?? project.locales.find((l) => l !== project.sourceLocale) ?? project.sourceLocale
    const wanted = Math.max(1, Number(args.limit) || 50)
    const page = (cursor: string | undefined, limit: number) =>
      unwrap(
        client.api.projects[':projectId'].keys.$get({
          param: { projectId: project.id },
          query: { locale, search: args.search, status: args.status as never, limit: String(limit), cursor },
        }),
      )
    let current = await page(undefined, Math.min(200, wanted))
    const rows = [...current.data]
    while (current.nextCursor && rows.length < wanted) {
      current = await page(current.nextCursor, Math.min(200, wanted - rows.length))
      rows.push(...current.data)
    }
    const total = current.total

    if (args.json) return console.log(JSON.stringify(rows, null, 2))
    if (!rows.length) return log.info('No keys found')
    log.message(
      table(
        rows.map((k) => [
          c.bold(k.context ? `${k.name} ${c.dim(`(${k.context})`)}` : k.name),
          (statusColor[k.status] ?? String)(k.status.replace('_', ' ')),
          clip(locale === project.sourceLocale ? k.source : k.value) || c.dim(clip(k.source, 40)),
        ]),
      ),
    )
    if (total > rows.length) log.info(c.dim(`${rows.length} of ${total} keys, use --limit to see more`))
  },
})

async function findKey(
  client: Client,
  project: Project,
  name: string,
  context?: string,
  locale = project.sourceLocale,
) {
  const page = await unwrap(
    client.api.projects[':projectId'].keys.$get({
      param: { projectId: project.id },
      query: { locale, name, limit: '200' },
    }),
  )
  const matches = page.data.filter((k) => context === undefined || k.context === context)
  if (!matches.length) throw new CliError(`Key ${name} not found`)
  const ids = new Set(matches.map((k) => k.id))
  if (ids.size > 1)
    throw new CliError(
      `${name} exists ${ids.size} times, pick one with --context: ${[...new Set(matches.map((k) => JSON.stringify(k.context)))].join(', ')}`,
    )
  return matches
}

export const translate = defineCommand({
  meta: { name: 'translate', description: 'Show a key, or set its translation' },
  args: {
    key: { type: 'positional', description: 'Key name', required: true },
    value: { type: 'positional', description: 'New value (ICU MessageFormat)', required: false },
    locale: { type: 'string', alias: 'l', description: 'Locale to set' },
    context: { type: 'string', description: 'Key context, when the name is not unique' },
    status: {
      type: 'enum',
      options: ['translated', 'needs_review', 'approved'],
      description: 'Status to set',
    },
  },
  async run({ args }) {
    const { client, config } = await projectSession()
    const project = await fetchProject(client, config.project)
    const [key] = await findKey(client, project, args.key, args.context)
    if (args.value === undefined) {
      const first = key!
      const rows =
        project.locales.length > 1 ? await findKey(client, project, args.key, args.context, 'all') : []
      log.info(`${c.bold(first.name)}${first.description ? c.dim(` · ${first.description}`) : ''}`)
      log.message(
        table([
          [c.bold(project.sourceLocale), c.dim('source'), first.source ?? ''],
          ...rows.map((k) => [
            c.bold(k.locale),
            (statusColor[k.status] ?? String)(k.status.replace('_', ' ')),
            k.value ?? '',
          ]),
        ]),
      )
      return
    }
    if (!args.locale) throw new CliError('Pass --locale to set a translation')
    const saved = await unwrap(
      client.api.projects[':projectId'].keys[':keyId'].translations[':locale'].$put({
        param: { projectId: project.id, keyId: key!.id, locale: args.locale },
        json: { value: args.value, status: args.status as never },
      }),
    )
    log.success(
      `${c.bold(args.key)} ${c.dim(saved.locale)} ${saved.value} ${c.dim(`(${saved.status.replace('_', ' ')})`)}`,
    )
  },
})

export const open = defineCommand({
  meta: { name: 'open', description: 'Open the project in the browser' },
  async run() {
    const { client, config } = await projectSession()
    const [project, me] = await Promise.all([
      fetchProject(client, config.project),
      unwrap(client.api.me.$get()),
    ])
    const workspace = me.workspaces.find((w) => w.id === project.workspaceId)
    const url = workspace ? `${client.host}/t/${workspace.slug}/p/${project.slug}` : client.host
    openBrowser(url)
    log.info(url)
  },
})
