import { defineCommand } from 'citty'
import { CliError, projectSession, unwrap } from '../client.ts'
import { fetchProject } from '../project.ts'
import { bar, c, log, table } from '../ui.ts'

async function load(locales?: string) {
  const { client, config } = await projectSession()
  const project = await fetchProject(client, config.project)
  const stats = await unwrap(
    client.api.projects[':projectId'].stats.$get({ param: { projectId: project.id } }),
  )
  const wanted = locales?.split(/[\s,]+/).filter(Boolean)
  const rows = stats.filter(
    (s) => s.locale !== project.sourceLocale && (!wanted || wanted.includes(s.locale)),
  )
  if (wanted && rows.length !== wanted.length)
    throw new CliError(
      `Unknown locale: ${wanted.filter((l) => !rows.some((r) => r.locale === l)).join(', ')}`,
    )
  return { project, rows }
}

const ratio = (done: number, total: number) => (total ? done / total : 1)
const pct = (r: number) => `${Math.floor(r * 100)}%`

export const status = defineCommand({
  meta: { name: 'status', description: 'Translation progress per locale' },
  args: {
    locale: { type: 'string', alias: 'l', description: 'Only these locales (comma separated)' },
    json: { type: 'boolean', description: 'Print JSON' },
  },
  async run({ args }) {
    const { project, rows } = await load(args.locale)
    if (args.json) return console.log(JSON.stringify(rows, null, 2))
    const total = rows[0]?.total ?? 0
    log.info(`${c.bold(project.name)} ${c.dim(`· ${total} keys · source ${project.sourceLocale}`)}`)
    if (!rows.length) return log.warn('No target locales yet')
    log.message(
      table([
        ['', '', c.dim('done'), c.dim('approved'), c.dim('review'), c.dim('open')],
        ...rows.map((r) => {
          const done = ratio(r.total - r.untranslated, r.total)
          return [
            c.bold(r.locale),
            bar(done),
            pct(done),
            String(r.approved),
            r.needsReview ? c.yellow(String(r.needsReview)) : '0',
            r.untranslated ? c.red(String(r.untranslated)) : '0',
          ]
        }),
      ]),
    )
  },
})

export const check = defineCommand({
  meta: { name: 'check', description: 'Fail (exit 1) when translations are missing, for CI' },
  args: {
    min: { type: 'string', default: '100', description: 'Minimum percentage per locale' },
    locale: { type: 'string', alias: 'l', description: 'Only these locales (comma separated)' },
    approved: { type: 'boolean', description: 'Count only approved translations' },
  },
  async run({ args }) {
    const min = Number(args.min)
    if (!Number.isFinite(min) || min < 0 || min > 100) throw new CliError('--min must be between 0 and 100')
    const { rows } = await load(args.locale)
    let failed = 0
    for (const r of rows) {
      const done = args.approved ? r.approved : r.total - r.untranslated
      const value = ratio(done, r.total)
      const ok = value * 100 >= min
      if (!ok) failed++
      const line = `${c.bold(r.locale)} ${pct(value)} ${c.dim(`(${done}/${r.total}${args.approved ? ' approved' : ''})`)}`
      if (ok) log.success(line)
      else log.error(line)
    }
    if (failed) {
      log.error(`${failed} of ${rows.length} locales below ${min}%`)
      process.exitCode = 1
    }
  },
})
