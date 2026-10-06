import { Plus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Button } from '#/components/ui/button.tsx'
import { Input } from '#/components/ui/input.tsx'
import { t, unwrap } from '#/lib/api.ts'
import { useAction } from '#/lib/mutations.ts'
import { queries } from '#/lib/queries.ts'
import { m } from '#/paraglide/messages.js'

export function FilePatternForm({ tenant, project }: { tenant: string; project: string }) {
  const [path, setPath] = useState('')
  const add = useAction(
    () => unwrap(t.projects[':project'].files.$post({ param: { tenant, project }, json: { path } })),
    {
      invalidate: [
        queries.project(tenant, project).queryKey,
        queries.runs(tenant, project).queryKey,
        queries.repo(tenant, project).queryKey,
      ],
      success: m.files_pattern_added(),
      onSuccess: () => setPath(''),
    },
  )
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (path.trim()) add.mutate(undefined)
  }
  return (
    <form onSubmit={submit} className="flex max-w-xl gap-2">
      <Input
        value={path}
        onChange={(e) => setPath(e.target.value)}
        placeholder="locales/%locale%.json"
        className="font-mono"
        aria-label={m.import_path()}
        required
      />
      <Button type="submit" variant="outline" disabled={add.isPending}>
        <Plus /> {m.action_add()}
      </Button>
    </form>
  )
}
