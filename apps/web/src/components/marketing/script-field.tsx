import { useEffect, useRef } from 'react'

export const scripts = {
  latin: 'abcdefghijklmnopqrstuvwxyzäöüéèçñ',
  greek: 'αβγδεζηθλμξπρσφψω',
  cyrillic: 'абвгджзиклмнопрстуфхчшыэюя',
  arabic: 'ابتثجحخدذرزسشصضطظعغفقكلمنهوي',
  hebrew: 'אבגדהוזחטיכלמנסעפצקרשת',
  devanagari: 'अआइईउऊएओकखगघचछजझटठडणतथदधनपफबभमयरलवशसह',
  thai: 'กขคงจฉชซญดตถทนบปผพฟภมยรลวศสหอฮ',
  georgian: 'აბგდევზთიკლმნოპჟრსტუფქღყშჩცძწჭხჯჰ',
  hangul: '가나다라마바사아자차카타파하한글말빛',
  kana: 'あいうえおかきくけこさしすせそアイウエオカキクケコ',
  han: '字文言語译翻詞書話意義名語',
} as const

const scriptList = Object.values(scripts)
const layers = [
  { size: 12, alpha: 0.35, speed: 0.4, parallax: 6 },
  { size: 16, alpha: 0.5, speed: 0.7, parallax: 14 },
  { size: 22, alpha: 0.7, speed: 1, parallax: 26 },
]
const font = 'ui-sans-serif, system-ui, "Noto Sans", "Noto Sans CJK SC", sans-serif'
const flipMs = 900

type Glyph = {
  x: number
  y: number
  vx: number
  vy: number
  layer: number
  script: number
  char: string
  flipAt: number
  swapped: boolean
}

const pick = <T,>(s: ArrayLike<T>) => s[Math.floor(Math.random() * s.length)]!

function randomGlyph(script = Math.floor(Math.random() * scriptList.length)) {
  return { script, char: pick(scriptList[script]!) }
}

function readColors() {
  const s = getComputedStyle(document.documentElement)
  return { base: s.getPropertyValue('--sage-9').trim(), accent: s.getPropertyValue('--jade-9').trim() }
}

export function ScriptField({ density = 1, intensity = 1 }: { density?: number; intensity?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current!
    const ctx = canvas.getContext('2d')!
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    let colors = readColors()
    let glyphs: Glyph[] = []
    let w = 0
    let h = 0
    let raf = 0
    let last = performance.now()
    let nextFlip = 0
    const mouse = { x: 0, y: 0, tx: 0, ty: 0 }

    const seed = () => {
      const count = Math.round(((w * h) / 4500) * density)
      glyphs = Array.from({ length: count }, () => {
        const angle = Math.random() * Math.PI * 2
        return {
          x: Math.random() * w,
          y: Math.random() * h,
          vx: Math.cos(angle) * 4,
          vy: Math.sin(angle) * 4 - 3,
          layer: Math.random() < 0.55 ? 0 : Math.random() < 0.7 ? 1 : 2,
          flipAt: -Infinity,
          swapped: false,
          ...randomGlyph(),
        }
      }).sort((a, b) => a.layer - b.layer)
    }

    const resize = () => {
      const dpr = Math.min(devicePixelRatio, 2)
      w = canvas.clientWidth
      h = canvas.clientHeight
      canvas.width = w * dpr
      canvas.height = h * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      seed()
    }

    const draw = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1)
      last = now
      mouse.x += (mouse.tx - mouse.x) * 0.04
      mouse.y += (mouse.ty - mouse.y) * 0.04

      if (!reduced && now > nextFlip && glyphs.length) {
        Object.assign(pick(glyphs), { flipAt: now, swapped: false })
        nextFlip = now + 60 + Math.random() * 160
      }

      ctx.clearRect(0, 0, w, h)
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      let layer = -1
      for (const g of glyphs) {
        const l = layers[g.layer]!
        if (g.layer !== layer) {
          layer = g.layer
          ctx.font = `${l.size}px ${font}`
        }
        if (!reduced) {
          g.x += g.vx * l.speed * dt
          g.y += g.vy * l.speed * dt
          if (g.x < -20) g.x += w + 40
          if (g.x > w + 20) g.x -= w + 40
          if (g.y < -20) g.y += h + 40
          if (g.y > h + 20) g.y -= h + 40
        }

        const t = (now - g.flipAt) / flipMs
        let alpha = l.alpha * 0.22 * intensity
        let tint = 0
        if (t < 1) alpha *= Math.abs(1 - 2 * t)
        if (t >= 0.5 && t < 1 && !g.swapped) {
          Object.assign(
            g,
            randomGlyph(
              (g.script + 1 + Math.floor(Math.random() * (scriptList.length - 1))) % scriptList.length,
            ),
          )
          g.swapped = true
        }
        if (g.swapped) {
          tint = Math.max(0, 1 - (t - 0.5) / 3)
          if (tint === 0) {
            g.flipAt = -Infinity
            g.swapped = false
          }
        }

        const x = g.x + mouse.x * l.parallax
        const y = g.y + mouse.y * l.parallax
        ctx.globalAlpha = alpha * (1 - tint)
        ctx.fillStyle = colors.base
        ctx.fillText(g.char, x, y)
        if (tint > 0) {
          ctx.globalAlpha = Math.min(1, alpha * 2.5) * tint
          ctx.fillStyle = colors.accent
          ctx.fillText(g.char, x, y)
        }
      }
      ctx.globalAlpha = 1
      if (!reduced) raf = requestAnimationFrame(draw)
    }

    const onMove = (e: PointerEvent) => {
      mouse.tx = e.clientX / innerWidth - 0.5
      mouse.ty = e.clientY / innerHeight - 0.5
    }

    const ro = new ResizeObserver(() => {
      resize()
      if (reduced) draw(performance.now())
    })
    ro.observe(canvas)
    const mo = new MutationObserver(() => {
      colors = readColors()
      if (reduced) draw(performance.now())
    })
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    addEventListener('pointermove', onMove)
    raf = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      mo.disconnect()
      removeEventListener('pointermove', onMove)
    }
  }, [density, intensity])

  return <canvas ref={ref} aria-hidden className="script-field absolute inset-0 size-full" />
}
