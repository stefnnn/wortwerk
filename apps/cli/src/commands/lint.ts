import { defineCommand } from 'citty'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describeStructureIssue, parseFile, structureIssue, validateIcu, type Entry } from '@wortwerk/formats'
import { CliError } from '../client.ts'
import { findProjectConfig, localPath, type ProjectConfig } from '../config.ts'
import { c, log, plural } from '../ui.ts'

const identity = (e: Pick<Entry, 'key' | 'context'>) => `${e.context ?? ''}\u0004${e.key}`

export type LintIssue = { path: string; key: string; level: 'error' | 'warning'; message: string }

/** Checks local target files against the source file: valid ICU, same placeholders, markup and plural forms. */
export async function lintProject(root: string, config: ProjectConfig, locales?: string[]) {
  const issues: LintIssue[] = []
  let checked = 0
  const read = (path: string) => readFile(join(root, path), 'utf8').catch(() => null)
  for (const file of config.files) {
    const sourcePath = localPath(config, file.path, config.sourceLocale)
    const sourceContent = await read(sourcePath)
    if (sourceContent === null) {
      issues.push({ path: sourcePath, key: '', level: 'warning', message: 'source file not found' })
      continue
    }
    let source
    try {
      source = parseFile(file.format, sourceContent, { locale: config.sourceLocale, isSource: true })
    } catch (error) {
      issues.push({
        path: sourcePath,
        key: '',
        level: 'error',
        message: `cannot parse: ${(error as Error).message}`,
      })
      continue
    }
    const byKey = new Map(source.entries.map((e) => [identity(e), e]))
    for (const e of source.entries) {
      const issue = validateIcu(e.value)
      if (issue)
        issues.push({
          path: sourcePath,
          key: e.key,
          level: 'error',
          message: `invalid ICU: ${issue.message}`,
        })
    }
    for (const locale of locales ?? config.locales.filter((l) => l !== config.sourceLocale)) {
      const path = localPath(config, file.path, locale)
      const content = await read(path)
      if (content === null) continue
      let target
      try {
        target = parseFile(file.format, content, { locale, options: source.options as never })
      } catch (error) {
        issues.push({ path, key: '', level: 'error', message: `cannot parse: ${(error as Error).message}` })
        continue
      }
      checked++
      for (const entry of target.entries) {
        if (!entry.value) continue
        const ref = byKey.get(identity(entry))
        if (!ref) {
          issues.push({ path, key: entry.key, level: 'warning', message: 'not in the source file' })
          continue
        }
        const issue = structureIssue(ref.value, entry.value, locale)
        if (issue)
          issues.push({ path, key: entry.key, level: 'error', message: describeStructureIssue(issue) })
      }
    }
  }
  return { issues, checked }
}

export const lint = defineCommand({
  meta: {
    name: 'lint',
    description: 'Check local translation files for broken placeholders, markup and plurals (offline)',
  },
  args: {
    locale: { type: 'string', alias: 'l', description: 'Only these locales (comma separated)' },
    strict: { type: 'boolean', description: 'Fail on warnings too' },
  },
  async run({ args }) {
    const found = await findProjectConfig()
    if (!found) throw new CliError('No wortwerk.json found. Run `wortwerk init` first.')
    const { issues, checked } = await lintProject(
      found.root,
      found.config,
      args.locale?.split(/[\s,]+/).filter(Boolean),
    )
    const byPath = new Map<string, LintIssue[]>()
    for (const issue of issues) byPath.set(issue.path, [...(byPath.get(issue.path) ?? []), issue])
    for (const [path, list] of byPath) {
      log.message(
        [
          c.bold(path),
          ...list.map(
            (i) =>
              `  ${i.level === 'error' ? c.red('error') : c.yellow('warn ')} ${i.key ? `${c.cyan(i.key)} ` : ''}${i.message}`,
          ),
        ].join('\n'),
      )
    }
    const errors = issues.filter((i) => i.level === 'error').length
    const warnings = issues.length - errors
    const summary = `${plural(checked, 'file')} checked: ${plural(errors, 'error')}, ${plural(warnings, 'warning')}`
    if (errors || (args.strict && warnings)) {
      log.error(summary)
      process.exitCode = 1
    } else log.success(summary)
  },
})
