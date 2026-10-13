import { confirm, intro, note, outro, spinner } from '@clack/prompts'
import { defineCommand } from 'citty'
import { hostname } from 'node:os'
import { join } from 'node:path'
import { CliError, createClient, failure, session, unwrap } from '../client.ts'
import {
  defaultHost,
  findProjectConfig,
  normalizeHost,
  projectConfigName,
  readCredentials,
  saveCredentials,
} from '../config.ts'
import { discoverProject, fetchProject, formatOf, syncConfig } from '../project.ts'
import { answer, c, log, openBrowser, sleep, waitForRuns } from '../ui.ts'

const list = (value: string | undefined) => value?.split(/[\s,]+/).filter(Boolean)

export const init = defineCommand({
  meta: { name: 'init', description: `Set up this folder with wortwerk (writes ${projectConfigName})` },
  args: {
    host: { type: 'string', description: 'wortwerk server' },
    project: { type: 'string', description: 'Link an existing project id and skip browser setup' },
    name: { type: 'string', description: 'Suggested project name' },
    'source-locale': { type: 'string', description: 'Suggested source locale' },
    locales: { type: 'string', description: 'Comma-separated locale list' },
    file: { type: 'string', description: 'Comma-separated file patterns' },
    provider: { type: 'string', description: 'github or bitbucket' },
    repo: { type: 'string', description: 'Repository as owner/name' },
    branch: { type: 'string', description: 'Tracked branch' },
    'no-open': { type: 'boolean', description: 'Print the setup URL without opening a browser' },
    'no-repo': { type: 'boolean', description: 'Create without connecting the detected repository' },
  },
  async run({ args }) {
    const cwd = process.cwd()
    intro(c.bold('wortwerk init'))
    const existing = await findProjectConfig(cwd)
    if (existing) {
      const overwrite = answer(
        await confirm({
          message: `${projectConfigName} exists already. Link to another project?`,
          initialValue: false,
        }),
      )
      if (!overwrite) return outro('Nothing changed')
    }

    if (args.project) {
      const client = await session({ host: args.host })
      const project = await fetchProject(client, args.project)
      await syncConfig(join(cwd, projectConfigName), project, client.host)
      log.success(`Wrote ${projectConfigName} for ${c.bold(project.name)}`)
      return outro('Next: wortwerk status')
    }

    const discoverySpinner = spinner()
    discoverySpinner.start('Inspecting this project')
    const discovered = await discoverProject(cwd)
    discoverySpinner.stop(
      discovered.patterns.length
        ? `Found ${discovered.patterns.length} translation file ${discovered.patterns.length === 1 ? 'pattern' : 'patterns'}`
        : 'No translation file pattern was detected; add one in the browser',
    )

    const credentials = await readCredentials()
    const host = normalizeHost(args.host ?? process.env.WORTWERK_HOST ?? credentials.host ?? defaultHost)
    const token = process.env.WORTWERK_TOKEN || credentials.hosts[host]?.token
    const client = createClient(host, token)
    const sourceLocale = args['source-locale'] ?? discovered.sourceLocale
    const locales = list(args.locales) ?? discovered.locales
    const selectedPaths = list(args.file)
    const patterns = selectedPaths
      ? selectedPaths.map((path) => {
          const found = discovered.patterns.find((item) => item.path === path)
          if (found) {
            const { localeAliases: _aliases, ...item } = found
            return item
          }
          const format = formatOf(path)
          if (!format) throw new CliError(`Cannot determine the format of ${path}`)
          if (!path.includes('%locale%')) throw new CliError(`File pattern ${path} must contain %locale%`)
          return { path, format, locales, confidence: 1 }
        })
      : discovered.patterns.slice(0, 20).map(({ localeAliases: _aliases, ...item }) => item)
    const provider = args.provider ?? discovered.git?.provider
    const repo = args.repo ?? discovered.git?.repo
    const detectedGit = args['no-repo']
      ? undefined
      : provider && repo
        ? {
            provider,
            repo,
            remote: discovered.git?.remote ?? 'origin',
            branch: args.branch ?? discovered.git?.branch,
          }
        : undefined
    if (detectedGit && detectedGit.provider !== 'github' && detectedGit.provider !== 'bitbucket')
      throw new CliError('--provider must be github or bitbucket')

    const proposal = {
      name: args.name ?? discovered.name,
      ...(detectedGit
        ? {
            git: detectedGit as {
              provider: 'github' | 'bitbucket'
              repo: string
              remote: string
              branch?: string
            },
          }
        : {}),
      patterns,
      ...(sourceLocale ? { sourceLocale } : {}),
      locales,
      localeAliases: discovered.localeAliases,
    }
    const started = await unwrap(
      client.api.setup.$post({
        json: { clientName: `wortwerk CLI on ${hostname()}`, proposal },
      }),
    )
    note(
      `${c.bold(started.userCode)}\n\n${c.dim('Complete project setup in your browser:')}\n${started.verificationUriComplete}`,
      'Browser setup',
    )
    if (!args['no-open']) openBrowser(started.verificationUriComplete)

    const waiting = spinner({ delay: 250 })
    waiting.start('Waiting for project setup in the browser')
    let interval = started.interval
    const deadline = Date.now() + started.expiresIn * 1000
    let result:
      | {
          token: string
          user: { email: string }
          project: { id: string; slug: string }
          run: { id: string } | null
          warning: string | null
        }
      | undefined
    while (Date.now() < deadline) {
      await sleep(interval * 1000)
      const response = await client.raw('/setup/token', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ deviceCode: started.deviceCode }),
      })
      if (response.ok) {
        result = (await response.json()) as NonNullable<typeof result>
        break
      }
      const error = await failure(response)
      if (error.code === 'authorization_pending') continue
      if (error.code === 'slow_down') {
        interval += 5
        continue
      }
      waiting.error(error.code === 'access_denied' ? 'Setup was denied' : 'The setup code expired')
      throw new CliError('Project setup did not finish. Run `wortwerk init` to try again.')
    }
    if (!result) {
      waiting.error('The setup code expired')
      throw new CliError('Project setup did not finish. Run `wortwerk init` to try again.')
    }
    waiting.stop('Project setup complete')

    credentials.hosts[host] = { token: result.token, email: result.user.email }
    credentials.host = host
    await saveCredentials(credentials)
    const authenticated = createClient(host, result.token)
    const project = await fetchProject(authenticated, result.project.id)
    await syncConfig(join(discovered.root, projectConfigName), project, host)
    if (result.warning) log.warn(result.warning)
    if (result.run)
      await waitForRuns(authenticated, project.id, [{ id: result.run.id, kind: 'pull', status: 'queued' }])
    log.success(`Wrote ${projectConfigName} for ${c.bold(project.name)}`)
    const next = project.repo
      ? ['wortwerk status', 'wortwerk pull', 'wortwerk sync']
      : ['wortwerk push', 'wortwerk status', 'wortwerk pull']
    outro(`Next: ${next.map((command) => c.cyan(command)).join(c.dim(' · '))}`)
  },
})
