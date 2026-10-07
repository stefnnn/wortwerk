import { Languages, Monitor, Moon, Sun } from 'lucide-react'
import { Button } from '#/components/ui/button.tsx'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu.tsx'
import { useTheme, type Theme } from '#/lib/theme.tsx'
import { m } from '#/paraglide/messages.js'
import { getLocale, locales, setLocale } from '#/paraglide/runtime.js'

const themeIcons = { light: Sun, dark: Moon, system: Monitor }

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const Icon = themeIcons[theme]
  const labels: Record<Theme, string> = {
    light: m.theme_light(),
    dark: m.theme_dark(),
    system: m.theme_system(),
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label={m.theme_label()} />}>
        <Icon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {(Object.keys(labels) as Theme[]).map((t) => {
          const ItemIcon = themeIcons[t]
          return (
            <DropdownMenuItem key={t} onClick={() => setTheme(t)}>
              <ItemIcon /> {labels[t]}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

const localeNames: Record<string, string> = {
  en: 'English',
  de: 'Deutsch',
  fr: 'Français',
  it: 'Italiano',
  es: 'Español',
  pt: 'Português',
  hi: 'हिन्दी',
  ja: '日本語',
  zh: '中文',
}

export function LocaleSwitch() {
  const current = getLocale()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="sm" aria-label={m.language_label()} />}>
        <Languages /> {current.toUpperCase()}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {locales.map((locale) => (
          <DropdownMenuItem key={locale} onClick={() => setLocale(locale)}>
            {localeNames[locale] ?? locale}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
