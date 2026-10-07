import { createFileRoute, redirect } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { GitBranch, MailPlus, Trash2, UserPen } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'
import { GrantsPicker, GuestAccessDialog, grantsSummary, type Grant } from '#/components/app/guest-access.tsx'
import { PageBody, PageHeader } from '#/components/app/page.tsx'
import { Badge } from '#/components/ui/badge.tsx'
import { t, unwrap } from '#/lib/api.ts'
import { Button, buttonVariants } from '#/components/ui/button.tsx'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#/components/ui/card.tsx'
import { Input } from '#/components/ui/input.tsx'
import { NativeSelect } from '#/components/ui/native-select.tsx'
import { Progress } from '#/components/ui/progress.tsx'
import { Skeleton } from '#/components/ui/skeleton.tsx'
import { authClient } from '#/lib/auth-client.ts'
import { formatDateTime, formatNumber, percent } from '#/lib/format.ts'
import { useAction } from '#/lib/mutations.ts'
import { queries } from '#/lib/queries.ts'
import { m } from '#/paraglide/messages.js'

export const Route = createFileRoute('/t/$tenant/settings')({
  beforeLoad: ({ context, params }) => {
    if (context.tenant.role === 'guest') throw redirect({ to: '/t/$tenant', params })
  },
  head: () => ({ meta: [{ title: `${m.nav_settings()} · wortwerk` }] }),
  validateSearch: z.object({ connect: z.string().optional() }),
  component: TenantSettings,
})

function TenantSettings() {
  const { tenant: slug } = Route.useParams()
  const { viewer } = Route.useRouteContext()
  const tenant = useQuery(queries.tenant(slug))
  const organizationKey = ['tenant', slug, 'organization']
  const organization = useQuery({
    queryKey: organizationKey,
    queryFn: async () => {
      const { data, error } = await authClient.organization.getFullOrganization({
        query: { organizationSlug: slug },
      })
      if (error) throw new Error(error.message ?? m.error_generic())
      return data
    },
  })
  const projects = useQuery(queries.projects(slug))
  const access = useQuery(queries.access(slug))
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'member' | 'guest'>('member')
  const [grants, setGrants] = useState<Grant[]>([])
  const [editing, setEditing] = useState<{ userId: string; name: string } | null>(null)
  const projectList = projects.data ?? []
  const grantsOf = (userId: string): Grant[] =>
    access.data
      ?.filter((a) => a.userId === userId)
      .map(({ projectId, locales }) => ({ projectId, locales })) ?? []

  const organizationId = tenant.data?.id ?? ''
  const invite = useAction(
    async () => {
      const { error } = await authClient.organization.inviteMember({
        email,
        role,
        organizationId,
        grants: role === 'guest' ? JSON.stringify(grants) : undefined,
      })
      if (error) throw new Error(error.message ?? m.error_generic())
    },
    {
      invalidate: [organizationKey],
      success: m.members_invited(),
      onSuccess: () => {
        setEmail('')
        setGrants([])
      },
    },
  )
  const saveAccess = useAction(
    (input: { userId: string; grants: Grant[] }) =>
      unwrap(
        t.access[':userId'].$put({
          param: { tenant: slug, userId: input.userId },
          json: { grants: input.grants },
        }),
      ),
    { invalidate: [queries.access(slug).queryKey], onSuccess: () => setEditing(null) },
  )
  const cancel = useAction(
    async (invitationId: string) => {
      const { error } = await authClient.organization.cancelInvitation({ invitationId })
      if (error) throw new Error(error.message ?? m.error_generic())
    },
    { invalidate: [organizationKey] },
  )
  const remove = useAction(
    async (memberIdOrEmail: string) => {
      const { error } = await authClient.organization.removeMember({ memberIdOrEmail, organizationId })
      if (error) throw new Error(error.message ?? m.error_generic())
    },
    { invalidate: [organizationKey, queries.tenant(slug).queryKey, queries.access(slug).queryKey] },
  )

  const submit = (event: FormEvent) => {
    event.preventDefault()
    invite.mutate(undefined)
  }

  const plan = tenant.data?.plan
  const usage = tenant.data?.usage
  const pending = organization.data?.invitations.filter((i) => i.status === 'pending') ?? []
  const seatsUsed = (organization.data?.members.length ?? 0) + pending.length
  const atMemberLimit = plan?.maxMembers != null && seatsUsed >= plan.maxMembers

  return (
    <>
      <PageHeader title={m.nav_settings()} description={tenant.data?.name} />
      <PageBody className="grid max-w-4xl gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {m.plan_title()} {plan && <Badge className="capitalize">{plan.id}</Badge>}
            </CardTitle>
            <CardDescription>
              {m.plan_billing_soon()} <ContactLink email={tenant.data?.contact} subject={tenant.data?.name} />
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6 sm:grid-cols-3">
            {!plan || !usage ? (
              <Skeleton className="h-12 sm:col-span-3" />
            ) : (
              <>
                <Usage label={m.plan_projects()} used={usage.projects} limit={plan.maxProjects} />
                <Usage label={m.plan_keys()} used={usage.keys} limit={plan.maxKeys} />
                <Usage label={m.plan_members()} used={usage.members} limit={plan.maxMembers} />
                <p className="text-muted-foreground text-sm sm:col-span-3">
                  {plan.machineTranslation ? m.plan_mt_included() : m.plan_mt_upgrade()}
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <ConnectionsCard tenant={slug} />

        <Card>
          <CardHeader>
            <CardTitle>{m.members_title()}</CardTitle>
            <CardDescription>{m.members_subtitle()}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6">
            {atMemberLimit ? (
              <p className="text-muted-foreground rounded-lg border border-dashed px-4 py-3 text-sm">
                {m.members_limit_reached({ count: plan.maxMembers ?? 0 })}{' '}
                <ContactLink email={tenant.data?.contact} subject={tenant.data?.name} />
              </p>
            ) : (
              <form onSubmit={submit} className="grid gap-3">
                <div className="flex gap-2">
                  <Input
                    type="email"
                    required
                    placeholder="name@company.ch"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                  <NativeSelect
                    aria-label={m.members_role()}
                    className="w-32 shrink-0"
                    value={role}
                    onChange={(e) => setRole(e.target.value === 'guest' ? 'guest' : 'member')}
                  >
                    <option value="member">{m.members_role_member()}</option>
                    <option value="guest">{m.members_role_guest()}</option>
                  </NativeSelect>
                  <Button
                    type="submit"
                    disabled={invite.isPending || !organizationId || (role === 'guest' && !grants.length)}
                  >
                    <MailPlus /> {m.members_invite()}
                  </Button>
                </div>
                {role === 'guest' && (
                  <div className="grid gap-2">
                    <p className="text-muted-foreground text-xs">{m.members_guest_hint()}</p>
                    <GrantsPicker projects={projectList} value={grants} onChange={setGrants} />
                  </div>
                )}
              </form>
            )}
            <ul className="divide-y rounded-lg border">
              {organization.data?.members.map((member) => (
                <li key={member.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 truncate font-medium">
                      {member.user.name}
                      {member.role === 'guest' && <Badge variant="outline">{m.members_role_guest()}</Badge>}
                    </p>
                    <p className="text-muted-foreground truncate">{member.user.email}</p>
                    {member.role === 'guest' && (
                      <p className="text-muted-foreground truncate text-xs">
                        {grantsSummary(grantsOf(member.userId), projectList) || m.guest_access_none()}
                      </p>
                    )}
                  </div>
                  {member.role === 'guest' && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={m.guest_access_edit()}
                      onClick={() => setEditing({ userId: member.userId, name: member.user.name })}
                    >
                      <UserPen />
                    </Button>
                  )}
                  {member.userId !== viewer.user.id && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={m.action_remove()}
                      onClick={() => remove.mutate(member.id)}
                    >
                      <Trash2 />
                    </Button>
                  )}
                </li>
              ))}
              {pending.map((invitation) => (
                <li key={invitation.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 truncate">
                      {invitation.email}
                      {invitation.role === 'guest' && (
                        <Badge variant="outline">{m.members_role_guest()}</Badge>
                      )}
                    </p>
                    {invitation.role === 'guest' && (
                      <p className="text-muted-foreground truncate text-xs">
                        {grantsSummary(parseGrants(invitation.grants), projectList)}
                      </p>
                    )}
                    <p className="text-muted-foreground">
                      {m.members_pending({ date: formatDateTime(invitation.expiresAt) })}
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => cancel.mutate(invitation.id)}>
                    {m.action_cancel()}
                  </Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </PageBody>
      {editing && (
        <GuestAccessDialog
          key={editing.userId}
          open
          name={editing.name}
          projects={projectList}
          initial={grantsOf(editing.userId)}
          pending={saveAccess.isPending}
          onOpenChange={(open) => !open && setEditing(null)}
          onSave={(next) => saveAccess.mutate({ userId: editing.userId, grants: next })}
        />
      )}
    </>
  )
}

function parseGrants(json: string | null | undefined): Grant[] {
  try {
    return json ? (JSON.parse(json) as Grant[]) : []
  } catch {
    return []
  }
}

function ConnectionsCard({ tenant }: { tenant: string }) {
  const connections = useQuery(queries.gitConnections(tenant))
  const { connect } = Route.useSearch()
  const navigate = Route.useNavigate()
  const remove = useAction(
    (connectionId: string) =>
      unwrap(t.git.connections[':connectionId'].$delete({ param: { tenant, connectionId } })),
    { invalidate: [queries.gitConnections(tenant).queryKey] },
  )

  useEffect(() => {
    if (!connect) return
    if (connect === 'github' || connect === 'bitbucket') toast.success(m.git_connected())
    else if (connect === 'requested') toast.info(m.git_requested())
    void navigate({ search: {}, replace: true })
  }, [connect, navigate])

  const available = connections.data?.available
  const providers = [
    { id: 'github', name: 'GitHub', enabled: available?.github },
    { id: 'bitbucket', name: 'Bitbucket', enabled: available?.bitbucket },
  ] as const

  return (
    <Card>
      <CardHeader>
        <CardTitle>{m.git_title()}</CardTitle>
        <CardDescription>{m.git_subtitle()}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {connections.data && connections.data.connections.length > 0 && (
          <ul className="divide-y rounded-lg border">
            {connections.data.connections.map((c) => (
              <li key={c.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                <GitBranch className="text-muted-foreground size-4" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{c.accountName}</p>
                  <p className="text-muted-foreground">
                    {c.provider === 'github' ? 'GitHub' : 'Bitbucket'} · {formatDateTime(c.createdAt)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={m.action_remove()}
                  onClick={() => remove.mutate(c.id)}
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap gap-2">
          {providers.map((p) =>
            p.enabled ? (
              <a
                key={p.id}
                href={`/api/t/${tenant}/git/connect/${p.id}`}
                className={buttonVariants({ variant: 'outline' })}
              >
                {m.git_connect({ provider: p.name })}
              </a>
            ) : (
              <Button key={p.id} variant="outline" disabled title={m.git_not_configured()}>
                {m.git_connect({ provider: p.name })}
              </Button>
            ),
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function ContactLink({ email, subject }: { email?: string | null; subject?: string }) {
  if (!email) return null
  const query = subject ? `?subject=${encodeURIComponent(`wortwerk upgrade: ${subject}`)}` : ''
  return (
    <a href={`mailto:${email}${query}`} className="text-primary underline-offset-4 hover:underline">
      {m.plan_contact({ email })}
    </a>
  )
}

function Usage({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="text-muted-foreground tabular-nums">
          {formatNumber(used)} / {limit === null ? '∞' : formatNumber(limit)}
        </span>
      </div>
      <Progress className="mt-2" value={limit === null ? 0 : percent(used, limit)} />
    </div>
  )
}
