import { MorphingWords } from './morphing-words.tsx'
import { ScriptField } from './script-field.tsx'

export function HeroBackground() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <ScriptField density={2.15} intensity={2.45} />
      <MorphingWords />
    </div>
  )
}
