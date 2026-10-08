import { cancel, isCancel, log, spinner } from '@clack/prompts'
import { spawn } from 'node:child_process'
import { styleText } from 'node:util'
import { unwrap, type Client } from './client.ts'

export const c = {
  bold: (s: string) => styleText('bold', s),
  dim: (s: string) => styleText('dim', s),
  green: (s: string) => styleText('green', s),
  red: (s: string) => styleText('red', s),
  yellow: (s: string) => styleText('yellow', s),
  cyan: (s: string) => styleText('cyan', s),
}

export function answer<T>(value: T): Exclude<T, symbol> {
  if (isCancel(value)) {
    cancel('Cancelled')
    process.exit(130)
  }
  return value as Exclude<T, symbol>
}

export function openBrowser(url: string) {
  if (process.env.BROWSER === 'none') return
  const [command, ...args] =
    process.platform === 'darwin'
      ? ['open', url]
      : process.platform === 'win32'
        ? ['cmd', '/c', 'start', '""', url]
        : ['xdg-open', url]
  try {
    spawn(command!, args, { stdio: 'ignore', detached: true })
      .on('error', () => {})
      .unref()
  } catch {
    // no browser available (ssh, container): the URL is printed anyway
  }
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export function bar(ratio: number, width = 20) {
  const filled = Math.round(Math.max(0, Math.min(1, ratio)) * width)
  return c.green('█'.repeat(filled)) + c.dim('░'.repeat(width - filled))
}

export function table(rows: string[][]) {
  // eslint-disable-next-line no-control-regex
  const visible = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '').length
  const widths = rows[0]!.map((_, i) => Math.max(...rows.map((r) => visible(r[i] ?? ''))))
  return rows
    .map((r) =>
      r
        .map((cell, i) => cell + ' '.repeat(widths[i]! - visible(cell)))
        .join('  ')
        .trimEnd(),
    )
    .join('\n')
}

type Run = { id: string; kind: string; status: string; result?: unknown; error?: string | null }

const labels: Record<string, string> = {
  import: 'Import',
  export: 'Export',
  pull: 'Pull from repository',
  push: 'Export to repository',
  machine: 'Machine translation',
}

function describeResult(result: unknown) {
  if (!result || typeof result !== 'object') return ''
  const r = result as Record<string, unknown>
  const files = Array.isArray(r.files) ? (r.files as Record<string, unknown>[]) : []
  const count = (key: string) =>
    [r, ...files].reduce((n, o) => n + (typeof o[key] === 'number' ? (o[key] as number) : 0), 0)
  const parts: string[] = []
  const add = (n: number, label: string) => n && parts.push(`${n} ${label}`)
  add(count('keysAdded'), 'keys added')
  add(count('keysRestored'), 'restored')
  add(count('keysObsoleted'), 'obsolete')
  add(count('translationsChanged'), 'translations changed')
  add(count('conflicts'), 'conflicts')
  add(count('translated'), 'translated')
  add(Array.isArray(r.failed) ? r.failed.length : 0, 'failed')
  if (r.skipped === true) parts.push('already up to date')
  if (typeof r.pullRequestUrl === 'string') parts.push(r.pullRequestUrl)
  return parts.join(', ')
}

/** Polls queued runs until they finish; returns false if any failed. */
export async function waitForRuns(client: Client, projectId: string, runs: Run[]) {
  let ok = true
  for (const queued of runs) {
    const s = spinner()
    s.start(`${labels[queued.kind] ?? queued.kind} queued`)
    let run: Run = queued
    while (run.status === 'queued' || run.status === 'running') {
      await sleep(1500)
      run = await unwrap(
        client.api.projects[':projectId'].runs[':runId'].$get({ param: { projectId, runId: queued.id } }),
      )
      if (run.status === 'running') s.message(`${labels[run.kind] ?? run.kind} running`)
    }
    const detail = describeResult(run.result)
    if (run.status === 'succeeded')
      s.stop(`${labels[run.kind] ?? run.kind} done${detail ? c.dim(` · ${detail}`) : ''}`)
    else {
      ok = false
      s.error(`${labels[run.kind] ?? run.kind} failed: ${run.error ?? 'unknown error'}`)
    }
  }
  return ok
}

export function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`
}

export { log }
