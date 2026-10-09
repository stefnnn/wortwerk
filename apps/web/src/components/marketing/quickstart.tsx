import { Link } from '@tanstack/react-router'
import { ArrowRight, Check, Copy, Terminal } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { cn } from '#/lib/utils.ts'
import { m } from '#/paraglide/messages.js'

const command = 'npx wortwerk init'

export function InitCommand({ className }: { className?: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () =>
    navigator.clipboard.writeText(command).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  return (
    <button
      type="button"
      onClick={copy}
      aria-label={`${m.action_copy()}: ${command}`}
      className={cn(
        'bg-card hover:border-primary/60 group inline-flex items-center gap-3 rounded-lg border py-2 pr-2.5 pl-3.5 font-mono text-sm shadow-xs transition-colors',
        className,
      )}
    >
      <span className="text-primary select-none">$</span>
      <span>{command}</span>
      <span className="text-muted-foreground group-hover:text-foreground flex size-6 items-center justify-center rounded transition-colors">
        {copied ? <Check className="text-primary size-3.5" /> : <Copy className="size-3.5" />}
      </span>
    </button>
  )
}

export function Quickstart() {
  const items = [m.quickstart_1(), m.quickstart_2(), m.quickstart_3(), m.quickstart_4()]
  return (
    <div className="grid items-center gap-12 lg:grid-cols-2">
      <div>
        <p className="text-primary mb-3 inline-flex items-center gap-2 text-sm font-medium">
          <Terminal className="size-4" /> CLI
        </p>
        <h2 className="text-3xl font-semibold tracking-tight text-balance">{m.quickstart_title()}</h2>
        <p className="text-muted-foreground mt-3 text-pretty">{m.quickstart_subtitle()}</p>
        <InitCommand className="mt-6" />
        <ol className="mt-8 space-y-3 text-sm">
          {items.map((item, i) => (
            <li key={item} className="flex gap-3">
              <span className="text-primary flex size-5 shrink-0 items-center justify-center rounded-full border border-[var(--jade-7)] font-mono text-[11px]">
                {i + 1}
              </span>
              {item}
            </li>
          ))}
        </ol>
        <Link
          to="/docs/$slug"
          params={{ slug: 'cli' }}
          hash="quick-setup-with-init"
          className="text-primary mt-8 inline-flex items-center gap-1.5 text-sm font-medium hover:underline"
        >
          {m.quickstart_docs()} <ArrowRight className="size-4" />
        </Link>
      </div>
      <TerminalPreview />
    </div>
  )
}

function Line({
  mark = '│',
  className,
  children,
}: {
  mark?: string
  className?: string
  children?: ReactNode
}) {
  return (
    <div className="flex gap-3">
      <span className={cn('text-muted-foreground w-3 shrink-0 select-none', className)}>{mark}</span>
      <span className="min-w-0">{children}</span>
    </div>
  )
}

function TerminalPreview() {
  const done = 'text-[var(--jade-11)]'
  return (
    <div className="bg-card overflow-hidden rounded-xl border shadow-sm">
      <div className="flex items-center gap-1.5 border-b px-4 py-3">
        {[0, 1, 2].map((i) => (
          <span key={i} className="size-2.5 rounded-full bg-[var(--sage-6)]" />
        ))}
        <span className="text-muted-foreground ml-3 font-mono text-xs">~/code/webshop</span>
      </div>
      <div className="overflow-x-auto p-5 font-mono text-[13px] leading-6 whitespace-nowrap">
        <div>
          <span className="text-primary">$</span> {command}
        </div>
        <Line mark="┌">
          <span className="font-semibold">wortwerk init</span>
        </Line>
        <Line />
        <Line mark="◇" className={done}>
          Found 1 translation file pattern
        </Line>
        <Line>
          <span className="text-muted-foreground">locales/%locale%.json · en → de, fr, it</span>
        </Line>
        <Line />
        <Line mark="◇" className={done}>
          Browser setup <span className="font-semibold">BCDF-GHJK</span>
        </Line>
        <Line>
          <span className="text-muted-foreground">github.com/acme/webshop · main</span>
        </Line>
        <Line />
        <Line mark="◇" className={done}>
          Project setup complete
        </Line>
        <Line mark="◇" className={done}>
          Pull from repository done <span className="text-muted-foreground">· 412 keys added</span>
        </Line>
        <Line mark="◆" className={done}>
          Wrote wortwerk.json for <span className="font-semibold">webshop</span>
        </Line>
        <Line />
        <Line mark="└">
          Next: <span className="text-primary">wortwerk status</span>
          <span className="text-muted-foreground"> · </span>
          <span className="text-primary">wortwerk pull</span>
        </Line>
      </div>
    </div>
  )
}
