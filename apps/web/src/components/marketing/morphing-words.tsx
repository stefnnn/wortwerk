import { useEffect, useRef } from 'react'
import { cn } from '#/lib/utils.ts'
import { scripts } from './script-field.tsx'

type Locale = 'en' | 'de' | 'fr' | 'it' | 'es' | 'pt' | 'ru' | 'el' | 'ar' | 'hi' | 'ja' | 'ko' | 'zh'

const localeScript: Record<Locale, string> = {
  en: scripts.latin,
  de: scripts.latin,
  fr: scripts.latin,
  it: scripts.latin,
  es: scripts.latin,
  pt: scripts.latin,
  ru: scripts.cyrillic,
  el: scripts.greek,
  ar: scripts.arabic,
  hi: scripts.devanagari,
  ja: scripts.kana,
  ko: scripts.hangul,
  zh: scripts.han,
}

const phrases = (
  [
    {
      key: 'common.save',
      values: {
        en: 'Save changes',
        de: 'Änderungen speichern',
        ja: '変更を保存',
        fr: 'Enregistrer',
        ar: 'حفظ التغييرات',
        es: 'Guardar cambios',
        hi: 'बदलाव सहेजें',
        ko: '변경사항 저장',
      },
    },
    {
      key: 'auth.welcome',
      values: {
        en: 'Welcome back',
        fr: 'Bon retour',
        ru: 'С возвращением',
        de: 'Willkommen zurück',
        zh: '欢迎回来',
        it: 'Bentornato',
        el: 'Καλώς ήρθες ξανά',
        ja: 'おかえりなさい',
      },
    },
    {
      key: 'cart.checkout',
      values: {
        en: 'Checkout',
        pt: 'Finalizar compra',
        ko: '결제하기',
        de: 'Zur Kasse',
        hi: 'चेकआउट',
        es: 'Pagar',
        ru: 'Оформить заказ',
        zh: '结算',
      },
    },
  ] satisfies { key: string; values: Partial<Record<Locale, string>> }[]
).map((p) => ({ key: p.key, entries: Object.entries(p.values) as [Locale, string][] }))

const slots = ['top-18 right-[6%]', 'top-60 right-[16%]', 'top-98 right-[4%]']

const pick = (s: string) => s[Math.floor(Math.random() * s.length)]!

const scrambleTick = 80
const scrambleWindow = 0.12

function scramble(el: HTMLElement, from: string, to: string, pool: string, done: () => void) {
  const fromChars = [...from]
  const toChars = [...to]
  const len = Math.max(fromChars.length, toChars.length)
  const noise = Array.from({ length: len }, () => pick(pool))
  const start = performance.now()
  const duration = 700 + len * 25
  let raf = 0
  let lastTick = -Infinity
  const step = (now: number) => {
    const p = Math.min((now - start) / duration, 1)
    if (now - lastTick >= scrambleTick || p === 1) {
      lastTick = now
      const nodes: (string | HTMLElement)[] = []
      for (let i = 0; i < len; i++) {
        const reveal = 0.15 + (i / len) * 0.85
        if (p >= reveal) nodes.push(toChars[i] ?? '')
        else if (p < reveal - scrambleWindow) nodes.push(fromChars[i] ?? '')
        else if (toChars[i] === ' ') nodes.push(' ')
        else {
          if (Math.random() < 0.35) noise[i] = pick(pool)
          const span = document.createElement('span')
          span.className = 'opacity-40'
          span.textContent = noise[i]!
          nodes.push(span)
        }
      }
      el.replaceChildren(...nodes)
    }
    if (p < 1) raf = requestAnimationFrame(step)
    else done()
  }
  raf = requestAnimationFrame(step)
  return () => cancelAnimationFrame(raf)
}

function Word({ phrase, slot, delay }: { phrase: (typeof phrases)[number]; slot: string; delay: number }) {
  const textRef = useRef<HTMLSpanElement>(null)
  const localeRef = useRef<HTMLSpanElement>(null)
  const entries = phrase.entries

  useEffect(() => {
    const text = textRef.current!
    const locale = localeRef.current!
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    let i = 0
    let cancel = () => {}
    let timer = 0

    const advance = () => {
      const [, from] = entries[i]!
      i = (i + 1) % entries.length
      const [loc, to] = entries[i]!
      locale.textContent = loc
      text.dir = loc === 'ar' ? 'rtl' : 'ltr'
      cancel = scramble(text, from, to, localeScript[loc], schedule)
    }
    const schedule = () => {
      timer = window.setTimeout(advance, 3200 + Math.random() * 1800)
    }

    if (!reduced) timer = window.setTimeout(advance, delay)
    return () => {
      cancel()
      clearTimeout(timer)
      text.textContent = entries[0]![1]
      locale.textContent = entries[0]![0]
    }
  }, [entries, delay])

  return (
    <div className={cn('absolute flex flex-col items-end gap-1 text-right', slot)}>
      <span className="text-muted-foreground/70 flex items-center gap-2 font-mono text-[11px]">
        {phrase.key}
        <span
          ref={localeRef}
          className="border-border/70 rounded border px-1 py-px text-[10px] text-(--jade-11)/80 uppercase"
        >
          {entries[0]![0]}
        </span>
      </span>
      <span
        ref={textRef}
        className="text-3xl font-thin tracking-tight whitespace-nowrap text-(--sage-9)/50 xl:text-4xl"
      >
        {entries[0]![1]}
      </span>
    </div>
  )
}

export function MorphingWords() {
  return (
    <div aria-hidden className="absolute inset-0 max-lg:hidden">
      {phrases.map((phrase, i) => (
        <Word key={phrase.key} phrase={phrase} slot={slots[i]!} delay={600 + i * 1300} />
      ))}
    </div>
  )
}
