import { useState } from 'react'
import { Badge } from '#/components/ui/badge.tsx'
import { Button } from '#/components/ui/button.tsx'
import { Checkbox } from '#/components/ui/checkbox.tsx'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog.tsx'
import { cn } from '#/lib/utils.ts'
import { m } from '#/paraglide/messages.js'

export type Grant = { projectId: string; locales: string[] | null }
export type GrantProject = { id: string; name: string; locales: { code: string }[] }

export function grantsSummary(grants: Grant[], projects: GrantProject[]) {
  return grants
    .map((g) => {
      const p = projects.find((x) => x.id === g.projectId)
      if (!p) return null
      return g.locales ? `${p.name} (${g.locales.join(', ')})` : p.name
    })
    .filter(Boolean)
    .join(', ')
}

/** Projects a guest may reach; per project all languages (locales: null) or a chosen subset. */
export function GrantsPicker({
  projects,
  value,
  onChange,
}: {
  projects: GrantProject[]
  value: Grant[]
  onChange: (value: Grant[]) => void
}) {
  const toggleProject = (id: string, on: boolean) =>
    onChange(on ? [...value, { projectId: id, locales: null }] : value.filter((g) => g.projectId !== id))
  const toggleLocale = (project: GrantProject, grant: Grant, code: string) => {
    const all = project.locales.map((l) => l.code)
    const current = new Set(grant.locales ?? all)
    if (!current.delete(code)) current.add(code)
    if (!current.size) return
    const locales = all.length === current.size ? null : all.filter((c) => current.has(c))
    onChange(value.map((g) => (g.projectId === grant.projectId ? { ...g, locales } : g)))
  }

  if (!projects.length) return <p className="text-muted-foreground text-sm">{m.guest_access_none()}</p>

  return (
    <ul className="divide-y rounded-lg border">
      {projects.map((p) => {
        const grant = value.find((g) => g.projectId === p.id)
        return (
          <li key={p.id} className="grid gap-2 px-3 py-2.5 text-sm">
            <label className="flex items-center gap-2.5 font-medium">
              <Checkbox checked={!!grant} onCheckedChange={(on) => toggleProject(p.id, on === true)} />
              {p.name}
            </label>
            {grant && (
              <div className="flex flex-wrap items-center gap-1.5 pl-6.5">
                {p.locales.map((l) => {
                  const on = !grant.locales || grant.locales.includes(l.code)
                  return (
                    <button key={l.code} type="button" onClick={() => toggleLocale(p, grant, l.code)}>
                      <Badge
                        variant={on ? 'default' : 'outline'}
                        className={cn('font-mono', !on && 'opacity-60')}
                      >
                        {l.code}
                      </Badge>
                    </button>
                  )
                })}
                {!grant.locales && (
                  <span className="text-muted-foreground text-xs">{m.guest_access_all_languages()}</span>
                )}
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

export function GuestAccessDialog({
  name,
  projects,
  initial,
  open,
  pending,
  onOpenChange,
  onSave,
}: {
  name: string
  projects: GrantProject[]
  initial: Grant[]
  open: boolean
  pending: boolean
  onOpenChange: (open: boolean) => void
  onSave: (grants: Grant[]) => void
}) {
  const [value, setValue] = useState(initial)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{m.guest_access_title()}</DialogTitle>
          <DialogDescription>{name}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-4">
          <GrantsPicker projects={projects} value={value} onChange={setValue} />
        </div>
        <DialogFooter>
          <Button disabled={pending || !value.length} onClick={() => onSave(value)}>
            {m.action_save()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
