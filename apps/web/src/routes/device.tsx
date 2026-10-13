import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery } from '@tanstack/react-query'
import { CircleCheck, CircleX, Terminal } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { z } from 'zod'
import { AuthLayout } from '#/components/auth-layout.tsx'
import { Button } from '#/components/ui/button.tsx'
import { FieldError } from '#/components/ui/field.tsx'
import { Input } from '#/components/ui/input.tsx'
import { Skeleton } from '#/components/ui/skeleton.tsx'
import { client, unwrap } from '#/lib/api.ts'
import { getViewer } from '#/lib/viewer.ts'
import { m } from '#/paraglide/messages.js'

export const Route = createFileRoute('/device')({
  validateSearch: z.object({ code: z.string().max(20).optional().catch(undefined) }),
  beforeLoad: async ({ location }) => {
    const viewer = await getViewer()
    if (!viewer) throw redirect({ to: '/sign-in', search: { redirect: location.href } })
    return { viewer }
  },
  component: Device,
})

function Device() {
  const { code } = Route.useSearch()
  if (!code) return <EnterCode />
  return <Confirm code={code} />
}

function EnterCode() {
  const navigate = useNavigate()
  const [value, setValue] = useState('')
  const submit = (event: FormEvent) => {
    event.preventDefault()
    navigate({ to: '/device', search: { code: value.trim().toUpperCase() } })
  }
  return (
    <AuthLayout title={m.device_title()} description={m.device_enter_code()}>
      <form onSubmit={submit} className="grid gap-3">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="ABCD-EFGH"
          className="text-center font-mono text-lg tracking-widest uppercase"
          autoFocus
          required
        />
        <Button type="submit" size="lg">
          {m.device_continue()}
        </Button>
      </form>
    </AuthLayout>
  )
}

function Confirm({ code }: { code: string }) {
  const { viewer } = Route.useRouteContext()
  const navigate = useNavigate()
  const request = useQuery({
    queryKey: ['device', code],
    queryFn: () => unwrap(client.api.account.device[':code'].$get({ param: { code } })),
    retry: false,
  })
  const decide = useMutation({
    mutationFn: (approve: boolean) =>
      unwrap(client.api.account.device[':code'].$post({ param: { code }, json: { approve } })).then(
        () => approve,
      ),
  })

  if (decide.isSuccess) {
    return (
      <AuthLayout
        title={decide.data ? m.device_approved_title() : m.device_denied_title()}
        description={decide.data ? m.device_approved_body() : m.device_denied_body()}
      >
        <div className="text-muted-foreground flex justify-center [&_svg]:size-12">
          {decide.data ? <CircleCheck className="text-primary" /> : <CircleX />}
        </div>
      </AuthLayout>
    )
  }
  if (request.isPending) {
    return (
      <AuthLayout title={m.device_title()}>
        <Skeleton className="h-24 w-full" />
      </AuthLayout>
    )
  }
  if (request.error) {
    return (
      <AuthLayout title={m.device_title()}>
        <FieldError>{request.error.message}</FieldError>
        <Button className="mt-6" variant="outline" onClick={() => navigate({ to: '/device', search: {} })}>
          {m.device_other_code()}
        </Button>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title={m.device_title()} description={m.device_confirm_body({ email: viewer.user.email })}>
      <div className="grid gap-6">
        <div className="flex items-center gap-3 rounded-lg border px-4 py-3">
          <Terminal className="text-muted-foreground size-5 shrink-0" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{request.data.clientName}</p>
            <p className="text-muted-foreground font-mono text-sm tracking-widest">{request.data.userCode}</p>
          </div>
        </div>
        <p className="text-muted-foreground text-sm">{m.device_code_hint()}</p>
        {decide.error && <FieldError>{decide.error.message}</FieldError>}
        <div className="grid gap-2">
          <Button size="lg" onClick={() => decide.mutate(true)} disabled={decide.isPending}>
            {m.device_approve()}
          </Button>
          <Button size="lg" variant="ghost" onClick={() => decide.mutate(false)} disabled={decide.isPending}>
            {m.device_deny()}
          </Button>
        </div>
      </div>
    </AuthLayout>
  )
}
