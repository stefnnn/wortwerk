import { confirm, intro, multiselect, outro, select, spinner, text } from '@clack/prompts'
import { defineCommand } from 'citty'
import { basename, join } from 'node:path'
import { CliError, session, unwrap } from '../client.ts'
import { findProjectConfig, projectConfigName } from '../config.ts'
import { detectPatterns, fetchProject, syncConfig } from '../project.ts'
import { answer, c, log } from '../ui.ts'

const slugify = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)

export const init = defineCommand({
  meta: { name: 'init', description: `Link this folder to a project (writes ${projectConfigName})` },
  args: {
    host: { type: 'string', description: 'wortwerk server' },
    project: { type: 'string', description: 'Project id, skips the prompts' },
  },
  async run({ args }) {
    const cwd = process.cwd()
    intro(c.bold('wortwerk init'))
    const existing = await findProjectConfig(cwd)
    if (existing?.root === cwd) {
      const overwrite = answer(
        await confirm({
          message: `${projectConfigName} exists already. Link to another project?`,
          initialValue: false,
        }),
      )
      if (!overwrite) return outro('Nothing changed')
    }
    const client = await session({ host: args.host })

    let projectId = args.project
    if (!projectId) {
      const me = await unwrap(client.api.me.$get())
      if (!me.workspaces.length)
        throw new CliError('This token has no workspace. Create one at ' + client.host)
      const workspace =
        me.workspaces.length === 1
          ? me.workspaces[0]!.slug
          : answer(
              await select({
                message: 'Workspace',
                options: me.workspaces.map((w) => ({ value: w.slug, label: w.name, hint: w.slug })),
              }),
            )
      const projects = await unwrap(
        client.api.workspaces[':workspace'].projects.$get({ param: { workspace } }),
      )
      const choice = answer(
        await select({
          message: 'Project',
          options: [
            ...projects.map((p) => ({
              value: p.id,
              label: p.name,
              hint: [p.sourceLocale, ...p.locales.filter((l) => l !== p.sourceLocale)].join(' '),
            })),
            { value: '', label: c.cyan('+ New project') },
          ],
        }),
      )
      projectId = choice || (await createProject(client, workspace))
    }

    let project = await fetchProject(client, projectId)
    if (project.repo) {
      log.info(
        `Connected to ${c.bold(`${project.repo.repo}@${project.repo.branch}`)}: keys come from the repository and sync on push.`,
      )
    } else if (!project.files.length) {
      const s = spinner()
      s.start('Looking for translation files')
      const found = await detectPatterns(cwd, project.sourceLocale)
      s.stop(
        found.length
          ? `Found ${found.length} candidate ${found.length === 1 ? 'pattern' : 'patterns'}`
          : 'No translation files found',
      )
      let paths: string[] = []
      if (found.length) {
        paths = answer(
          await multiselect({
            message: 'Which files hold your translations?',
            options: found
              .slice(0, 20)
              .map((f) => ({ value: f.path, label: f.path, hint: f.locales.join(' ') })),
            initialValues: [found[0]!.path],
            required: false,
          }),
        )
      }
      if (!paths.length) {
        const typed = answer(
          await text({
            message: 'File pattern',
            placeholder: 'locales/%locale%.json',
            validate: (v) => (v?.includes('%locale%') ? undefined : 'Use %locale% where the locale goes'),
          }),
        )
        paths = [typed]
      }
      for (const path of paths)
        await unwrap(client.api.projects[':projectId'].files.$post({ param: { projectId }, json: { path } }))
      project = await fetchProject(client, projectId)
    }

    await syncConfig(join(cwd, projectConfigName), project, client.host)
    const next = project.repo
      ? ['wortwerk status', 'wortwerk pull', 'wortwerk sync']
      : ['wortwerk push', 'wortwerk status', 'wortwerk pull']
    log.success(`Wrote ${projectConfigName} for ${c.bold(project.name)}`)
    outro(`Next: ${next.map((n) => c.cyan(n)).join(c.dim(' · '))}`)
  },
})

async function createProject(client: Awaited<ReturnType<typeof session>>, workspace: string) {
  const name = answer(await text({ message: 'Project name', initialValue: basename(process.cwd()) }))
  const slug = answer(await text({ message: 'Slug', initialValue: slugify(name) }))
  const sourceLocale = answer(await text({ message: 'Source locale', initialValue: 'en' }))
  const locales = answer(await text({ message: 'Target locales', placeholder: 'de fr it' }))
  const created = await unwrap(
    client.api.workspaces[':workspace'].projects.$post({
      param: { workspace },
      json: { name, slug, sourceLocale, locales: locales.split(/[\s,]+/).filter(Boolean) },
    }),
  )
  return created.id
}
