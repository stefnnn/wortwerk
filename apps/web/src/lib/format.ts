import { getLocale } from '#/paraglide/runtime.js'

export function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
}

export function formatDateTime(value: string | Date | null | undefined) {
  if (!value) return ''
  return new Intl.DateTimeFormat(getLocale(), { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  )
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat(getLocale()).format(value)
}

export function percent(part: number, total: number) {
  return total ? Math.round((part / total) * 100) : 0
}

export function localeName(code: string) {
  try {
    return new Intl.DisplayNames([getLocale()], { type: 'language' }).of(code.replace('_', '-')) ?? code
  } catch {
    return code
  }
}
