import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from 'react'

export type Theme = 'light' | 'dark' | 'system'
const storageKey = 'wortwerk-theme'
const changeEvent = 'wortwerk-theme-change'

export const themeScript = `(function(){try{var t=localStorage.getItem('${storageKey}')||'system';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d)}catch(e){}})()`

type ThemeState = { theme: Theme; resolved: 'light' | 'dark'; setTheme: (theme: Theme) => void }

function subscribe(callback: () => void) {
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  window.addEventListener(changeEvent, callback)
  window.addEventListener('storage', callback)
  media.addEventListener('change', callback)
  return () => {
    window.removeEventListener(changeEvent, callback)
    window.removeEventListener('storage', callback)
    media.removeEventListener('change', callback)
  }
}

function readTheme(): Theme {
  return (localStorage.getItem(storageKey) as Theme | null) ?? 'system'
}

function readResolved(): 'light' | 'dark' {
  const theme = readTheme()
  const dark =
    theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  return dark ? 'dark' : 'light'
}

function setTheme(theme: Theme) {
  localStorage.setItem(storageKey, theme)
  window.dispatchEvent(new Event(changeEvent))
}

const ThemeContext = createContext<ThemeState>({ theme: 'system', resolved: 'light', setTheme })

export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useSyncExternalStore(subscribe, readTheme, () => 'system' as const)
  const resolved = useSyncExternalStore(subscribe, readResolved, () => 'light' as const)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolved === 'dark')
  }, [resolved])

  return <ThemeContext value={{ theme, resolved, setTheme }}>{children}</ThemeContext>
}

export function useTheme() {
  return useContext(ThemeContext)
}
