import { createFileRoute, Link, redirect, useNavigate } from '@tanstack/react-router'
import { useMutation } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { AuthLayout } from '#/components/auth-layout.tsx'
import { Button } from '#/components/ui/button.tsx'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '#/components/ui/field.tsx'
import { Input } from '#/components/ui/input.tsx'
import { authClient } from '#/lib/auth-client.ts'
import { redirectSearch } from '#/lib/redirect.ts'
import { getViewer } from '#/lib/viewer.ts'
import { m } from '#/paraglide/messages.js'

export const Route = createFileRoute('/sign-up')({
  validateSearch: redirectSearch,
  beforeLoad: async ({ search }) => {
    if (await getViewer()) throw redirect({ href: search.redirect ?? '/app' })
  },
  head: () => ({ meta: [{ title: `${m.sign_up_title()} · wortwerk` }] }),
  component: SignUp,
})

function SignUp() {
  const { redirect: redirectTo } = Route.useSearch()
  const navigate = useNavigate()
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm({ ...form, [key]: e.target.value })

  const signUp = useMutation({
    mutationFn: async () => {
      const { error } = await authClient.signUp.email(form)
      if (error) throw new Error(error.message ?? m.error_generic())
    },
    onSuccess: () => navigate({ href: redirectTo ?? '/onboarding' }),
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    signUp.mutate()
  }

  return (
    <AuthLayout title={m.sign_up_title()} description={m.sign_up_subtitle()}>
      <form onSubmit={submit}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="name">{m.field_name()}</FieldLabel>
            <Input id="name" autoComplete="name" required value={form.name} onChange={set('name')} />
          </Field>
          <Field>
            <FieldLabel htmlFor="email">{m.field_email()}</FieldLabel>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={form.email}
              onChange={set('email')}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="password">{m.field_password()}</FieldLabel>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              value={form.password}
              onChange={set('password')}
            />
            <FieldDescription>{m.field_password_hint()}</FieldDescription>
          </Field>
          {signUp.error && <FieldError>{signUp.error.message}</FieldError>}
          <Button type="submit" size="lg" disabled={signUp.isPending}>
            {m.sign_up_submit()}
          </Button>
        </FieldGroup>
      </form>
      <p className="text-muted-foreground mt-8 text-sm">
        {m.sign_up_have_account()}{' '}
        <Link
          to="/sign-in"
          search={{ redirect: redirectTo }}
          className="text-foreground font-medium underline-offset-4 hover:underline"
        >
          {m.sign_in_title()}
        </Link>
      </p>
    </AuthLayout>
  )
}
