import { Input } from '#/components/ui/input.tsx'
import { localeName } from '#/lib/format.ts'

const common = [
  'en',
  'en-GB',
  'en-US',
  'de',
  'de-CH',
  'de-AT',
  'fr',
  'fr-CH',
  'it',
  'it-CH',
  'rm',
  'es',
  'pt',
  'pt-BR',
  'nl',
  'sv',
  'da',
  'nb',
  'fi',
  'pl',
  'cs',
  'sk',
  'hu',
  'ro',
  'ru',
  'uk',
  'tr',
  'el',
  'ar',
  'he',
  'ja',
  'zh',
  'zh-TW',
  'ko',
]

export function LocaleInput(props: Omit<React.ComponentProps<typeof Input>, 'list'>) {
  return (
    <>
      <Input list="wortwerk-locales" autoComplete="off" spellCheck={false} {...props} />
      <datalist id="wortwerk-locales">
        {common.map((code) => (
          <option key={code} value={code}>
            {localeName(code)}
          </option>
        ))}
      </datalist>
    </>
  )
}
