import { createFileRoute, Link, redirect, useNavigate } from '@tanstack/react-router'
import { useMutation } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { MailCheck } from 'lucide-react'
import { AuthLayout } from '#/components/auth-layout.tsx'
import { Button } from '#/components/ui/button.tsx'
import { Field, FieldError, FieldGroup, FieldLabel } from '#/components/ui/field.tsx'
import { Input } from '#/components/ui/input.tsx'
import { authClient } from '#/lib/auth-client.ts'
import { redirectSearch } from '#/lib/redirect.ts'
import { getViewer } from '#/lib/viewer.ts'
import { m } from '#/paraglide/messages.js'

export const Route = createFileRoute('/sign-in')({
  validateSearch: redirectSearch,
  beforeLoad: async ({ search }) => {
    if (await getViewer()) throw redirect({ href: search.redirect ?? '/app' })
  },
  head: () => ({ meta: [{ title: `${m.sign_in_title()} · wortwerk` }] }),
  component: SignIn,
})

function SignIn() {
  const { redirect: redirectTo } = Route.useSearch()
  const navigate = useNavigate()
  const [mode, setMode] = useState<'magic' | 'password'>('magic')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const target = redirectTo ?? '/app'

  const magic = useMutation({
    mutationFn: async () => {
      const { error } = await authClient.signIn.magicLink({ email, callbackURL: target })
      if (error) throw new Error(error.message)
    },
  })
  const credentials = useMutation({
    mutationFn: async () => {
      const { error } = await authClient.signIn.email({ email, password })
      if (error) throw new Error(error.message ?? m.error_generic())
    },
    onSuccess: () => navigate({ href: target }),
  })
  const active = mode === 'magic' ? magic : credentials

  const submit = (event: FormEvent) => {
    event.preventDefault()
    active.mutate()
  }

  if (magic.isSuccess) {
    return (
      <AuthLayout title={m.magic_link_sent_title()} description={m.magic_link_sent_body({ email })}>
        <MailCheck className="text-primary size-10" />
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title={m.sign_in_title()} description={m.sign_in_subtitle()}>
      <form onSubmit={submit}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="email">{m.field_email()}</FieldLabel>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          {mode === 'password' && (
            <Field>
              <FieldLabel htmlFor="password">{m.field_password()}</FieldLabel>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
          )}
          {active.error && <FieldError>{active.error.message}</FieldError>}
          <Button type="submit" size="lg" disabled={active.isPending}>
            {mode === 'magic' ? m.sign_in_magic_link() : m.sign_in_submit()}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setMode(mode === 'magic' ? 'password' : 'magic')}
          >
            {mode === 'magic' ? m.sign_in_use_password() : m.sign_in_use_magic_link()}
          </Button>
        </FieldGroup>
      </form>
      <p className="text-muted-foreground mt-8 text-sm">
        {m.sign_in_no_account()}{' '}
        <Link
          to="/sign-up"
          search={{ redirect: redirectTo }}
          className="text-foreground font-medium underline-offset-4 hover:underline"
        >
          {m.sign_up_title()}
        </Link>
      </p>
    </AuthLayout>
  )
}
