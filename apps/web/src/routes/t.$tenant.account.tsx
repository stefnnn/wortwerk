import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Copy, KeyRound, Terminal, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { PageBody, PageHeader } from '#/components/app/page.tsx'
import { Alert, AlertDescription, AlertTitle } from '#/components/ui/alert.tsx'
import { Badge } from '#/components/ui/badge.tsx'
import { Button } from '#/components/ui/button.tsx'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#/components/ui/card.tsx'
import { Field, FieldLabel } from '#/components/ui/field.tsx'
import { Input } from '#/components/ui/input.tsx'
import { NativeSelect } from '#/components/ui/native-select.tsx'
import { client, unwrap } from '#/lib/api.ts'
import { formatDate, formatDateTime } from '#/lib/format.ts'
import { useAction } from '#/lib/mutations.ts'
import { queries } from '#/lib/queries.ts'
import { m } from '#/paraglide/messages.js'

export const Route = createFileRoute('/t/$tenant/account')({
  component: Account,
})

const expiryOptions = [30, 90, 365, 0] as const

function Account() {
  const { viewer, tenant } = Route.useRouteContext()
  return (
    <>
      <PageHeader title={m.account_title()} description={viewer.user.email} />
      <PageBody className="grid max-w-4xl gap-6">
        <CliCard />
        <ApiTokensCard tenantId={tenant.id} tenantName={tenant.name} />
      </PageBody>
    </>
  )
}

function CliCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{m.cli_title()}</CardTitle>
        <CardDescription>{m.cli_subtitle()}</CardDescription>
      </CardHeader>
      <CardContent>
        <pre className="bg-muted overflow-x-auto rounded-lg p-3 text-xs">
          {`npx wortwerk login
npx wortwerk init
npx wortwerk pull`}
        </pre>
      </CardContent>
    </Card>
  )
}

function ApiTokensCard({ tenantId, tenantName }: { tenantId: string; tenantName: string }) {
  const tokens = useQuery(queries.apiTokens())
  const [name, setName] = useState('')
  const [access, setAccess] = useState<'read' | 'write'>('write')
  const [scope, setScope] = useState<'tenant' | 'all'>('tenant')
  const [expires, setExpires] = useState<(typeof expiryOptions)[number]>(90)
  const [created, setCreated] = useState<string | null>(null)
  const [now] = useState(() => Date.now())
  const invalidate = [queries.apiTokens().queryKey]

  const create = useAction(
    () =>
      unwrap(
        client.api.account.tokens.$post({
          json: {
            name,
            access,
            tenantId: scope === 'tenant' ? tenantId : null,
            expiresInDays: expires || null,
          },
        }),
      ),
    {
      invalidate,
      onSuccess: (result) => {
        setCreated(result.token)
        setName('')
      },
    },
  )
  const revoke = useAction(
    (tokenId: string) => unwrap(client.api.account.tokens[':tokenId'].$delete({ param: { tokenId } })),
    { invalidate },
  )

  const submit = (event: FormEvent) => {
    event.preventDefault()
    create.mutate(undefined)
  }
  const origin = typeof window === 'undefined' ? '' : window.location.origin

  return (
    <Card>
      <CardHeader>
        <CardTitle>{m.api_tokens_title()}</CardTitle>
        <CardDescription>
          {m.api_tokens_subtitle()}{' '}
          <a href="/api/v1/docs" className="text-primary underline-offset-4 hover:underline">
            {m.api_tokens_docs()}
          </a>
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {created && (
          <Alert>
            <KeyRound />
            <AlertTitle>{m.tokens_created()}</AlertTitle>
            <AlertDescription className="grid gap-2">
              <div className="flex items-center gap-2">
                <code className="bg-muted min-w-0 flex-1 truncate rounded px-2 py-1">{created}</code>
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label={m.action_copy()}
                  onClick={() => navigator.clipboard.writeText(created).then(() => toast.success(m.copied()))}
                >
                  <Copy />
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="token-name">{m.api_tokens_name()}</FieldLabel>
            <Input
              id="token-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={m.api_tokens_name_placeholder()}
              required
              maxLength={80}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="token-access">{m.api_tokens_access()}</FieldLabel>
            <NativeSelect
              id="token-access"
              value={access}
              onChange={(e) => setAccess(e.target.value === 'read' ? 'read' : 'write')}
            >
              <option value="write">{m.api_tokens_access_write()}</option>
              <option value="read">{m.api_tokens_access_read()}</option>
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel htmlFor="token-scope">{m.api_tokens_scope()}</FieldLabel>
            <NativeSelect
              id="token-scope"
              value={scope}
              onChange={(e) => setScope(e.target.value === 'all' ? 'all' : 'tenant')}
            >
              <option value="tenant">{tenantName}</option>
              <option value="all">{m.api_tokens_scope_all()}</option>
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel htmlFor="token-expiry">{m.api_tokens_expiry()}</FieldLabel>
            <NativeSelect
              id="token-expiry"
              value={expires}
              onChange={(e) => setExpires(Number(e.target.value) as (typeof expiryOptions)[number])}
            >
              {expiryOptions.map((days) => (
                <option key={days} value={days}>
                  {days ? m.api_tokens_expiry_days({ days }) : m.api_tokens_expiry_never()}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <div className="flex items-end">
            <Button type="submit" variant="outline" disabled={create.isPending}>
              {m.tokens_create()}
            </Button>
          </div>
        </form>
        {tokens.data && tokens.data.length > 0 && (
          <ul className="divide-y rounded-lg border">
            {tokens.data.map((token) => {
              const expired = token.expiresAt && new Date(token.expiresAt).getTime() < now
              return (
                <li key={token.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                  {token.name.startsWith('wortwerk CLI') ? (
                    <Terminal className="text-muted-foreground size-4 shrink-0" />
                  ) : (
                    <KeyRound className="text-muted-foreground size-4 shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-medium">{token.name}</span>
                      <Badge variant="secondary">
                        {token.access === 'read' ? m.api_tokens_access_read() : m.api_tokens_access_write()}
                      </Badge>
                      <Badge variant="outline">{token.workspace?.name ?? m.api_tokens_scope_all()}</Badge>
                      {expired && <Badge variant="destructive">{m.api_tokens_expired()}</Badge>}
                    </p>
                    <p className="text-muted-foreground font-mono text-xs">
                      {token.tokenPrefix}… ·{' '}
                      {token.lastUsedAt
                        ? m.tokens_used({ date: formatDateTime(token.lastUsedAt) })
                        : m.tokens_unused()}
                      {token.expiresAt && !expired && (
                        <> · {m.api_tokens_expires({ date: formatDate(token.expiresAt) })}</>
                      )}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={m.tokens_revoke()}
                    onClick={() => revoke.mutate(token.id)}
                  >
                    <Trash2 />
                  </Button>
                </li>
              )
            })}
          </ul>
        )}
        <pre className="bg-muted overflow-x-auto rounded-lg p-3 text-xs">
          {`curl ${origin}/api/v1/me -H "Authorization: Bearer $WORTWERK_TOKEN"`}
        </pre>
      </CardContent>
    </Card>
  )
}
