import { Check, FileJson, GitMerge, GitPullRequest } from 'lucide-react'
import type { ReactNode } from 'react'
import { m } from '#/paraglide/messages.js'
import { BitbucketLogo, GitHubLogo } from './logos.tsx'

export function ProcessSteps() {
  const steps = [
    { title: m.step_connect_title(), body: m.step_connect(), visual: <ConnectVisual /> },
    { title: m.step_sync_title(), body: m.step_sync(), visual: <SyncVisual /> },
    { title: m.step_translate_title(), body: m.step_translate(), visual: <TranslateVisual /> },
    { title: m.step_merge_title(), body: m.step_merge(), visual: <MergeVisual /> },
  ]
  return (
    <div className="relative">
      <div
        aria-hidden
        className="absolute top-4 right-[12.5%] left-[12.5%] hidden border-t border-dashed border-[var(--sage-7)] lg:block"
      />
      <ol className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
        {steps.map((step, i) => (
          <li key={step.title} className="relative flex flex-col">
            <span className="bg-background text-primary relative mx-auto mb-5 flex size-8 items-center justify-center rounded-full border border-[var(--jade-7)] font-mono text-sm lg:mx-0 lg:ml-[calc(50%-1rem)]">
              {i + 1}
            </span>
            <div className="bg-card flex h-36 flex-col justify-center overflow-hidden rounded-xl border p-4 text-xs shadow-xs">
              {step.visual}
            </div>
            <h3 className="mt-5 font-medium">{step.title}</h3>
            <p className="text-muted-foreground mt-1.5 text-sm text-pretty">{step.body}</p>
          </li>
        ))}
      </ol>
    </div>
  )
}

function Row({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`flex items-center gap-2 rounded-md px-2 py-1.5 ${className}`}>{children}</div>
}

function ConnectVisual() {
  return (
    <div className="space-y-2 font-mono">
      <Row className="bg-muted">
        <GitHubLogo className="size-3.5" /> acme/webshop
        <span className="text-muted-foreground ml-auto">main</span>
      </Row>
      <Row className="border border-dashed">
        <BitbucketLogo className="size-3.5 text-[#2684ff]" /> acme/app
        <span className="text-muted-foreground ml-auto">develop</span>
      </Row>
      <Row className="text-muted-foreground">
        <FileJson className="size-3.5" /> locales/<span className="text-primary">%locale%</span>.json
      </Row>
    </div>
  )
}

function SyncVisual() {
  const keys = [
    ['checkout.title', true],
    ['cart.items', true],
    ['nav.home', false],
  ] as const
  return (
    <div className="space-y-1 font-mono">
      {keys.map(([key, isNew]) => (
        <Row key={key} className={isNew ? 'bg-accent/60' : ''}>
          <span className="truncate">{key}</span>
          {isNew ? (
            <span className="bg-primary text-primary-foreground ml-auto rounded px-1.5 font-sans text-[10px]">
              {m.step_sync_new()}
            </span>
          ) : (
            <Check className="text-muted-foreground ml-auto size-3.5" />
          )}
        </Row>
      ))}
    </div>
  )
}

function TranslateVisual() {
  const locales = [
    ['de', 96],
    ['fr', 81],
    ['it', 64],
  ] as const
  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2 rounded-md border px-2 py-1.5">
        <span className="text-muted-foreground">Checkout</span>
        <span className="text-muted-foreground">→</span>
        <span className="font-medium">Zur Kasse</span>
        <span className="ml-auto size-1.5 rounded-full bg-[var(--jade-9)]" />
      </div>
      {locales.map(([locale, pct]) => (
        <div key={locale} className="flex items-center gap-2 font-mono">
          <span className="text-muted-foreground w-5">{locale}</span>
          <div className="bg-muted h-1.5 flex-1 overflow-hidden rounded-full">
            <div className="bg-primary h-full rounded-full" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-muted-foreground w-8 text-right">{pct}%</span>
        </div>
      ))}
    </div>
  )
}

function MergeVisual() {
  return (
    <div className="space-y-2.5">
      <div className="flex items-start gap-2">
        <GitPullRequest className="text-primary mt-0.5 size-4 shrink-0" />
        <div className="min-w-0">
          <div className="truncate font-medium">{m.step_merge_pr()}</div>
          <div className="text-muted-foreground truncate font-mono text-[11px]">
            wortwerk/translations → main
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 font-mono">
        <span className="text-[var(--jade-11)]">+42</span>
        <span className="text-[var(--tomato-11)]">−3</span>
        <span className="flex gap-0.5">
          {[1, 1, 1, 1, 0].map((add, i) => (
            <span
              key={i}
              className={`size-2 rounded-[2px] ${add ? 'bg-[var(--jade-9)]' : 'bg-[var(--tomato-9)]'}`}
            />
          ))}
        </span>
      </div>
      <span className="bg-primary text-primary-foreground inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium">
        <GitMerge className="size-3" /> {m.step_merge_merged()}
      </span>
    </div>
  )
}
