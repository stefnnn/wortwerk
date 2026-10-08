export type Interpolation = 'icu' | 'i18next' | 'rails'

export type Entry = {
  key: string
  context?: string
  value: string
  isPlural: boolean
  description?: string
  needsReview?: boolean
  source?: string
}

export type JsonOptions = {
  style?: 'nested' | 'flat'
  plurals?: 'icu' | 'i18next'
  interpolation?: Interpolation
}

export type YamlOptions = {
  rootLocaleKey?: boolean
  interpolation?: Interpolation
  /** locale of the file, needed to render plural forms that the file doesn't have yet */
  locale?: string
  /** leave keys alone that aren't in the entries (the file is the locale's own, not derived from the source) */
  keepUnknown?: boolean
}

export type PoOptions = Record<string, never>

export type ScriptOptions = {
  exportName?: string
  interpolation?: Interpolation
}

export type FileFormat = 'json' | 'yaml' | 'po' | 'script'

export type FormatOptions = {
  json: JsonOptions
  yaml: YamlOptions
  po: PoOptions
  script: ScriptOptions
}

export type ParseContext<F extends FileFormat> = {
  locale: string
  isSource?: boolean
  options?: FormatOptions[F]
}

export type ParseResult<F extends FileFormat> = {
  entries: Entry[]
  options: FormatOptions[F]
}

export type SerializeContext<F extends FileFormat> = ParseContext<F> & {
  template?: string
  /** the template is this locale's own file: keys it has beyond the entries are kept */
  keepUnknown?: boolean
}
