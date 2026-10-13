import { useState, type FormEvent } from 'react'
import { Button } from '#/components/ui/button.tsx'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog.tsx'
import { Field, FieldGroup, FieldLabel } from '#/components/ui/field.tsx'
import { Input } from '#/components/ui/input.tsx'
import { NativeSelect } from '#/components/ui/native-select.tsx'
import { Textarea } from '#/components/ui/textarea.tsx'
import { t, unwrap } from '#/lib/api.ts'
import { useAction } from '#/lib/mutations.ts'
import { queries } from '#/lib/queries.ts'
import { m } from '#/paraglide/messages.js'

type Props = {
  tenant: string
  project: string
  files: Array<{ id: string; path: string }>
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (keyId: string) => void
}

export function NewKeyDialog({ tenant, project, files, open, onOpenChange, onCreated }: Props) {
  const [name, setName] = useState('')
  const [fileId, setFileId] = useState('')
  const [sourceValue, setSourceValue] = useState('')
  const [description, setDescription] = useState('')

  const create = useAction(
    () =>
      unwrap(
        t.projects[':project'].keys.$post({
          param: { tenant, project },
          json: { name, fileId: fileId || null, sourceValue, description },
        }),
      ),
    {
      invalidate: [['tenant', tenant, 'project', project, 'keys'], queries.stats(tenant, project).queryKey],
      onSuccess: (key) => {
        onOpenChange(false)
        setName('')
        setSourceValue('')
        setDescription('')
        onCreated(key.id)
      },
    },
  )

  const submit = (event: FormEvent) => {
    event.preventDefault()
    create.mutate(undefined)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{m.editor_new_key()}</DialogTitle>
            <DialogDescription>{m.new_key_body()}</DialogDescription>
          </DialogHeader>
          <FieldGroup className="py-6">
            <Field>
              <FieldLabel htmlFor="key-name">{m.new_key_name()}</FieldLabel>
              <Input
                id="key-name"
                required
                className="font-mono"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="checkout.title"
              />
            </Field>
            {files.length > 0 && (
              <Field>
                <FieldLabel htmlFor="key-file">{m.new_key_file()}</FieldLabel>
                <NativeSelect id="key-file" value={fileId} onChange={(e) => setFileId(e.target.value)}>
                  <option value="">—</option>
                  {files.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.path}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            )}
            <Field>
              <FieldLabel htmlFor="key-source">{m.new_key_source()}</FieldLabel>
              <Textarea
                id="key-source"
                rows={2}
                value={sourceValue}
                onChange={(e) => setSourceValue(e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="key-description">{m.new_key_description()}</FieldLabel>
              <Input
                id="key-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="submit" disabled={create.isPending}>
              {m.action_create()}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
