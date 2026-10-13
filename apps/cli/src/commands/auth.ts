import { intro, note, outro, spinner } from '@clack/prompts'
import { defineCommand } from 'citty'
import { hostname } from 'node:os'
import { CliError, createClient, failure, session, unwrap } from '../client.ts'
import { defaultHost, normalizeHost, readCredentials, saveCredentials } from '../config.ts'
import { c, log, openBrowser, sleep, table } from '../ui.ts'

const hostArg = { type: 'string', description: `wortwerk server (default ${defaultHost})` } as const

async function deviceLogin(host: string) {
  const client = createClient(host)
  const started = await unwrap(
    client.api.auth.device.$post({ json: { clientName: `wortwerk CLI on ${hostname()}` } }),
  )
  note(
    `${c.bold(started.userCode)}\n\n${c.dim('Confirm this code in your browser:')}\n${started.verificationUriComplete}`,
    'Your code',
  )
  openBrowser(started.verificationUriComplete)
  const s = spinner({ delay: 250 })
  s.start('Waiting for approval in the browser')
  let interval = started.interval
  const deadline = Date.now() + started.expiresIn * 1000
  while (Date.now() < deadline) {
    await sleep(interval * 1000)
    const res = await client.raw('/auth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ deviceCode: started.deviceCode }),
    })
    if (res.ok) {
      s.stop('Approved')
      return (await res.json()) as { token: string; user: { email: string } }
    }
    const error = await failure(res)
    if (error.code === 'authorization_pending') continue
    if (error.code === 'slow_down') {
      interval += 5
      continue
    }
    s.error(error.code === 'access_denied' ? 'Access was denied' : 'The code expired')
    throw new CliError('Login failed, run `wortwerk login` to try again.')
  }
  s.error('The code expired')
  throw new CliError('Login failed, run `wortwerk login` to try again.')
}

export const login = defineCommand({
  meta: { name: 'login', description: 'Sign in through your browser' },
  args: {
    host: hostArg,
    token: { type: 'string', description: 'Store an existing personal access token instead' },
  },
  async run({ args }) {
    const credentials = await readCredentials()
    const host = normalizeHost(args.host ?? process.env.WORTWERK_HOST ?? credentials.host ?? defaultHost)
    intro(`${c.bold('wortwerk')} ${c.dim(host)}`)
    let token = args.token
    let email: string
    if (token) {
      const me = await unwrap(createClient(host, token).api.me.$get())
      if (!me.user) throw new CliError('This is a project token, use a personal access token to sign in.')
      email = me.user.email
    } else {
      const result = await deviceLogin(host)
      token = result.token
      email = result.user.email
    }
    credentials.hosts[host] = { token, email }
    credentials.host = host
    await saveCredentials(credentials)
    outro(`Signed in as ${c.bold(email)}`)
  },
})

export const logout = defineCommand({
  meta: { name: 'logout', description: 'Revoke the stored token and sign out' },
  args: { host: hostArg },
  async run({ args }) {
    const credentials = await readCredentials()
    const host = normalizeHost(args.host ?? credentials.host ?? defaultHost)
    const stored = credentials.hosts[host]
    if (!stored) {
      log.info(`Not signed in to ${host}`)
      return
    }
    await unwrap(createClient(host, stored.token).api.me.token.$delete()).catch(() => {})
    delete credentials.hosts[host]
    if (credentials.host === host) delete credentials.host
    await saveCredentials(credentials)
    log.success(`Signed out of ${host}`)
  },
})

export const whoami = defineCommand({
  meta: { name: 'whoami', description: 'Show the signed-in user and workspaces' },
  args: { host: hostArg },
  async run({ args }) {
    const client = await session({ host: args.host })
    const me = await unwrap(client.api.me.$get())
    if (!me.user) {
      log.info(`Project token for project ${me.token.projectId} on ${client.host}`)
      return
    }
    log.info(
      `${c.bold(me.user.email)} on ${client.host}\n${c.dim(`token: ${me.token.access === 'read' ? 'read only' : 'read & write'}`)}`,
    )
    if (me.workspaces.length)
      log.message(table(me.workspaces.map((w) => [c.bold(w.slug), w.name, c.dim(`${w.role} · ${w.plan}`)])))
  },
})
