import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useMutation } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { AuthLayout } from '#/components/auth-layout.tsx'
import { Button } from '#/components/ui/button.tsx'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '#/components/ui/field.tsx'
import { Input } from '#/components/ui/input.tsx'
import { authClient } from '#/lib/auth-client.ts'
import { slugify } from '#/lib/format.ts'
import { getViewer } from '#/lib/viewer.ts'
import { m } from '#/paraglide/messages.js'

export const Route = createFileRoute('/onboarding')({
  beforeLoad: async ({ location }) => {
    const viewer = await getViewer()
    if (!viewer) throw redirect({ to: '/sign-in', search: { redirect: location.href } })
    return { viewer }
  },
  head: () => ({ meta: [{ title: `${m.onboarding_title()} · wortwerk` }] }),
  component: Onboarding,
})

function Onboarding() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const effectiveSlug = slugTouched ? slug : slugify(name)

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await authClient.organization.create({ name, slug: effectiveSlug })
      if (error) throw new Error(error.message ?? m.error_generic())
    },
    onSuccess: () => navigate({ to: '/t/$tenant', params: { tenant: effectiveSlug } }),
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    create.mutate()
  }

  return (
    <AuthLayout title={m.onboarding_title()} description={m.onboarding_subtitle()}>
      <form onSubmit={submit}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="name">{m.field_workspace_name()}</FieldLabel>
            <Input
              id="name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Acme"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="slug">{m.field_workspace_slug()}</FieldLabel>
            <Input
              id="slug"
              required
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              value={effectiveSlug}
              onChange={(e) => {
                setSlugTouched(true)
                setSlug(e.target.value)
              }}
            />
            <FieldDescription>wortwerk.ch/t/{effectiveSlug || 'acme'}</FieldDescription>
          </Field>
          {create.error && <FieldError>{create.error.message}</FieldError>}
          <Button type="submit" size="lg" disabled={create.isPending || !effectiveSlug}>
            {m.onboarding_submit()}
          </Button>
        </FieldGroup>
      </form>
    </AuthLayout>
  )
}
