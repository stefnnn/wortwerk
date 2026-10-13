import {
  buildPluralIcu,
  icuToText,
  localePluralCategories,
  parsePluralIcu,
  pluralBranchFor,
  textToIcu,
} from './icu.ts'
import type { Entry, Interpolation } from './types.ts'

export type Tree = { [key: string]: string | Tree }

export function isTree(value: unknown): value is Tree {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export type Leaf = { path: string[]; text: string }

export function collectLeaves(tree: Tree, path: string[] = [], out: Leaf[] = []) {
  for (const [key, value] of Object.entries(tree)) {
    if (isTree(value)) collectLeaves(value, [...path, key], out)
    else if (typeof value === 'string') out.push({ path: [...path, key], text: value })
  }
  return out
}

export function detectInterpolation(texts: string[]): Interpolation {
  if (texts.some((t) => /%\{[\w.-]+\}/.test(t))) return 'rails'
  if (texts.some((t) => /\{\{\s*[\w.-]+\s*\}\}/.test(t))) return 'i18next'
  return 'icu'
}

export function toEntry(key: string, text: string, interpolation: Interpolation): Entry {
  const value = textToIcu(text, interpolation)
  return { key, value, isPlural: interpolation === 'icu' && parsePluralIcu(value) !== null }
}

export function pluralEntry(
  key: string,
  branches: Record<string, string>,
  interpolation: Interpolation,
): Entry {
  const converted: Record<string, string> = {}
  for (const [category, text] of Object.entries(branches))
    converted[category] = textToIcu(text, interpolation, true)
  return { key, value: buildPluralIcu(converted), isPlural: true }
}

export function expandPlural(entry: Entry, locale: string, interpolation: Interpolation) {
  const message = parsePluralIcu(entry.value)
  if (!message) return null
  const out: Record<string, string> = {}
  for (const category of localePluralCategories(locale)) {
    out[category] = icuToText(pluralBranchFor(message, category), interpolation, true)
  }
  return out
}

export function setPath(tree: Tree, path: string[], value: string | Tree) {
  let node = tree
  for (let i = 0; i < path.length - 1; i++) {
    const segment = path[i]!
    const next = node[segment]
    if (next === undefined) node = node[segment] = {}
    else if (isTree(next)) node = next
    else {
      node[path.slice(i).join('.')] = value
      return
    }
  }
  node[path[path.length - 1]!] = value
}

export function detectIndent(template: string | undefined) {
  const match = template && /^[{[]\r?\n([ \t]+)/.exec(template)
  return match ? match[1]! : '  '
}
