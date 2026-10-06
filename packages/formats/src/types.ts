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
}

export type PoOptions = Record<string, never>

export type FileFormat = 'json' | 'yaml' | 'po'

export type FormatOptions = {
  json: JsonOptions
  yaml: YamlOptions
  po: PoOptions
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
}
