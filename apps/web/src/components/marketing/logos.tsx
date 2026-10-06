import type { ReactNode } from 'react'
import {
  siBitbucket,
  siDjango,
  siGithub,
  siGnu,
  siJson,
  siNextdotjs,
  siNodedotjs,
  siPython,
  siReact,
  siRubyonrails,
  siSvelte,
  siWordpress,
  siYaml,
  type SimpleIcon,
} from 'simple-icons'
import { cn } from '#/lib/utils.ts'

type MarkProps = { className?: string }

function Mark({ className, children }: MarkProps & { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" className={cn('size-6', className)} aria-hidden>
      {children}
    </svg>
  )
}

export function GitHubLogo({ className }: MarkProps) {
  return <Icon icon={siGithub} className={className} />
}

export function BitbucketLogo({ className }: MarkProps) {
  return <Icon icon={siBitbucket} className={className} />
}

function Icon({ icon, className }: MarkProps & { icon: SimpleIcon }) {
  return (
    <Mark className={className}>
      <path fill="currentColor" d={icon.path} />
    </Mark>
  )
}

export type StackItem = { name: string; detail: string; color: string; mark: ReactNode }

const brand = (icon: SimpleIcon, dark = false) => ({
  color: dark ? 'var(--foreground)' : `#${icon.hex}`,
  mark: <path fill="currentColor" d={icon.path} />,
})

export const frameworks: StackItem[] = [
  { name: 'React', detail: 'react-i18next', ...brand(siReact) },
  { name: 'Next.js', detail: 'next-intl', ...brand(siNextdotjs, true) },
  { name: 'Svelte', detail: 'svelte-i18n', ...brand(siSvelte) },
  { name: 'Node.js', detail: 'i18next', ...brand(siNodedotjs) },
  { name: 'Ruby on Rails', detail: 'rails-i18n', ...brand(siRubyonrails) },
  { name: 'Django', detail: 'gettext', ...brand(siDjango, true) },
  { name: 'WordPress', detail: 'gettext', ...brand(siWordpress) },
  { name: 'Python', detail: 'Babel', ...brand(siPython) },
]

export const formats: StackItem[] = [
  { name: 'JSON', detail: 'nested · flat · i18next', ...brand(siJson, true) },
  { name: 'YAML', detail: 'Rails', ...brand(siYaml) },
  { name: 'gettext PO', detail: '.po · .pot', ...brand(siGnu) },
  {
    name: 'ICU',
    detail: 'MessageFormat',
    color: 'var(--jade-11)',
    mark: (
      <text
        x="12"
        y="12"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="9"
        fontWeight="700"
        fontFamily="var(--font-mono)"
        fill="currentColor"
      >
        {'{#}'}
      </text>
    ),
  },
]

export function StackChip({ item }: { item: StackItem }) {
  return (
    <div
      className="group bg-card/70 flex items-center gap-3 rounded-lg border px-3.5 py-2.5 backdrop-blur-sm transition-colors hover:border-[var(--sage-8)]"
      style={{ '--brand': item.color } as React.CSSProperties}
    >
      <Mark className="text-muted-foreground size-6 shrink-0 transition-colors group-hover:text-[var(--brand)]">
        {item.mark}
      </Mark>
      <div className="leading-tight">
        <div className="text-sm font-medium">{item.name}</div>
        <div className="text-muted-foreground font-mono text-[11px]">{item.detail}</div>
      </div>
    </div>
  )
}
