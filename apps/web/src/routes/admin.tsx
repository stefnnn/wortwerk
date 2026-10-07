import { Link, createFileRoute, notFound, redirect } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, ExternalLink, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { getPlan, planIds } from '@wortwerk/core/plans'
import { PageBody, PageHeader } from '#/components/app/page.tsx'
import { Logo } from '#/components/brand.tsx'
import { LocaleSwitch, ThemeToggle } from '#/components/preferences.tsx'
import { Badge } from '#/components/ui/badge.tsx'
import { Button } from '#/components/ui/button.tsx'
import { Card, CardContent } from '#/components/ui/card.tsx'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog.tsx'
import { Input } from '#/components/ui/input.tsx'
import { NativeSelect } from '#/components/ui/native-select.tsx'
import { Skeleton } from '#/components/ui/skeleton.tsx'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table.tsx'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#/components/ui/tabs.tsx'
import { client, unwrap } from '#/lib/api.ts'
import { formatDateTime, formatNumber } from '#/lib/format.ts'
import { useAction } from '#/lib/mutations.ts'
import { queries } from '#/lib/queries.ts'
import { getViewer } from '#/lib/viewer.ts'
import { m } from '#/paraglide/messages.js'

export const Route = createFileRoute('/admin')({
  beforeLoad: async ({ location }) => {
    const viewer = await getViewer()
    if (!viewer) throw redirect({ to: '/sign-in', search: { redirect: location.href } })
    if (!viewer.isAdmin) throw notFound()
    return { viewer }
  },
  head: () => ({ meta: [{ title: `${m.admin_title()} · wortwerk` }] }),
  component: AdminPage,
})

type Overview = Awaited<ReturnType<typeof loadOverview>>
type AdminUser = Overview['users'][number]

const loadOverview = () => unwrap(client.api.admin.overview.$get())

function AdminPage() {
  const { viewer } = Route.useRouteContext()
  const overview = useQuery(queries.adminOverview())
  const data = overview.data

  return (
    <div className="min-h-dvh">
      <header className="flex items-center gap-3 border-b px-6 py-3 md:px-8">
        <Logo />
        <Badge variant="secondary">{m.admin_title()}</Badge>
        <div className="flex-1" />
        <Link
          to="/app"
          className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-sm"
        >
          <ArrowLeft className="size-4" /> {m.admin_back()}
        </Link>
        <LocaleSwitch />
        <ThemeToggle />
      </header>
      <PageHeader title={m.admin_title()} description={viewer.user.email} />
      <PageBody className="grid gap-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label={m.admin_stat_users()} value={data?.totals.users} />
          <Stat
            label={m.admin_stat_workspaces()}
            value={data?.totals.workspaces}
            hint={data && planIds.map((id) => `${data.totals.byPlan[id] ?? 0} ${id}`).join(' · ')}
          />
          <Stat label={m.admin_stat_projects()} value={data?.totals.projects} />
          <Stat label={m.admin_stat_keys()} value={data?.totals.keys} />
        </div>
        {!data ? (
          <Skeleton className="h-64" />
        ) : (
          <Tabs defaultValue="users">
            <TabsList>
              <TabsTrigger value="users">{m.admin_tab_users()}</TabsTrigger>
              <TabsTrigger value="projects">{m.admin_tab_projects()}</TabsTrigger>
            </TabsList>
            <TabsContent value="users">
              <Users users={data.users} selfId={viewer.user.id} />
            </TabsContent>
            <TabsContent value="projects">
              <Projects projects={data.projects} />
            </TabsContent>
          </Tabs>
        )}
      </PageBody>
    </div>
  )
}

function Stat({ label, value, hint }: { label: string; value?: number; hint?: string }) {
  return (
    <Card size="sm">
      <CardContent>
        <p className="text-muted-foreground text-sm">{label}</p>
        {value === undefined ? (
          <Skeleton className="mt-1 h-8 w-20" />
        ) : (
          <p className="text-2xl font-semibold tabular-nums">{formatNumber(value)}</p>
        )}
        {hint && <p className="text-muted-foreground mt-1 text-xs capitalize">{hint}</p>}
      </CardContent>
    </Card>
  )
}

function Users({ users, selfId }: { users: AdminUser[]; selfId: string }) {
  const [search, setSearch] = useState('')
  const [deleting, setDeleting] = useState<AdminUser | null>(null)
  const needle = search.trim().toLowerCase()
  const rows = needle
    ? users.filter((u) => u.name.toLowerCase().includes(needle) || u.email.toLowerCase().includes(needle))
    : users

  const changePlan = useAction(
    (args: { id: string; plan: (typeof planIds)[number] }) =>
      unwrap(
        client.api.admin.workspaces[':id'].plan.$put({ param: { id: args.id }, json: { plan: args.plan } }),
      ),
    { invalidate: [queries.adminOverview().queryKey], success: m.admin_plan_changed() },
  )

  return (
    <div className="grid gap-4">
      <Input
        className="max-w-sm"
        placeholder={m.admin_search_users()}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{m.admin_col_user()}</TableHead>
              <TableHead>{m.admin_col_workspace()}</TableHead>
              <TableHead>{m.admin_col_plan()}</TableHead>
              <TableHead>{m.admin_col_usage()}</TableHead>
              <TableHead>{m.admin_col_joined()}</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((u) => (
              <TableRow key={u.id}>
                <TableCell>
                  <div className="font-medium">{u.name}</div>
                  <div className="text-muted-foreground flex items-center gap-2 text-xs">
                    {u.email}
                    {!u.emailVerified && <Badge variant="outline">{m.admin_unverified()}</Badge>}
                  </div>
                </TableCell>
                <TableCell>
                  {u.workspace ? (
                    <Link
                      to="/t/$tenant"
                      params={{ tenant: u.workspace.slug }}
                      className="hover:underline"
                      title={m.admin_open_workspace()}
                    >
                      {u.workspace.name}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">{m.admin_no_workspace()}</span>
                  )}
                  {u.memberships > (u.workspace ? 1 : 0) && (
                    <div className="text-muted-foreground text-xs">
                      {m.admin_member_of({ count: u.memberships - (u.workspace ? 1 : 0) })}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  {u.workspace && (
                    <NativeSelect
                      className="w-28"
                      aria-label={m.admin_col_plan()}
                      value={getPlan(u.workspace.plan).id}
                      disabled={changePlan.isPending}
                      onChange={(e) =>
                        changePlan.mutate({
                          id: u.workspace!.id,
                          plan: e.target.value as (typeof planIds)[number],
                        })
                      }
                    >
                      {planIds.map((id) => (
                        <option key={id} value={id}>
                          {id}
                        </option>
                      ))}
                    </NativeSelect>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground text-xs tabular-nums">
                  {u.workspace &&
                    m.admin_usage({
                      projects: formatNumber(u.workspace.projects),
                      keys: formatNumber(u.workspace.keys),
                      members: formatNumber(u.workspace.members),
                    })}
                </TableCell>
                <TableCell className="text-muted-foreground text-xs">{formatDateTime(u.createdAt)}</TableCell>
                <TableCell>
                  {u.id !== selfId && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={m.admin_delete_user()}
                      onClick={() => setDeleting(u)}
                    >
                      <Trash2 />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && <EmptyRow cols={6} />}
          </TableBody>
        </Table>
      </div>
      <DeleteUserDialog user={deleting} onClose={() => setDeleting(null)} />
    </div>
  )
}

function DeleteUserDialog({ user, onClose }: { user: AdminUser | null; onClose: () => void }) {
  const [confirm, setConfirm] = useState('')
  const remove = useAction((id: string) => unwrap(client.api.admin.users[':id'].$delete({ param: { id } })), {
    invalidate: [queries.adminOverview().queryKey],
    success: m.admin_user_deleted(),
    onSuccess: () => close(),
  })
  const close = () => {
    setConfirm('')
    onClose()
  }

  return (
    <Dialog open={user !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{m.admin_delete_title({ email: user?.email ?? '' })}</DialogTitle>
          <DialogDescription>{m.admin_delete_body({ email: user?.email ?? '' })}</DialogDescription>
        </DialogHeader>
        <Input
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder={user?.email}
          className="font-mono"
        />
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            {m.action_cancel()}
          </Button>
          <Button
            variant="destructive"
            disabled={!user || confirm !== user.email || remove.isPending}
            onClick={() => user && remove.mutate(user.id)}
          >
            {m.action_delete()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Projects({ projects }: { projects: Overview['projects'] }) {
  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{m.admin_col_project()}</TableHead>
            <TableHead>{m.admin_col_workspace()}</TableHead>
            <TableHead className="text-right">{m.admin_col_keys()}</TableHead>
            <TableHead className="text-right">{m.admin_col_languages()}</TableHead>
            <TableHead>{m.admin_col_repo()}</TableHead>
            <TableHead>{m.admin_col_last_sync()}</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {projects.map((p) => (
            <TableRow key={p.id}>
              <TableCell className="font-medium">{p.name}</TableCell>
              <TableCell>
                {p.workspace.name} <Badge variant="outline">{p.workspace.plan}</Badge>
              </TableCell>
              <TableCell className="text-right tabular-nums">{formatNumber(p.keys)}</TableCell>
              <TableCell className="text-right tabular-nums">{p.locales}</TableCell>
              <TableCell className="text-muted-foreground">{p.repo}</TableCell>
              <TableCell className="text-muted-foreground text-xs">
                {formatDateTime(p.lastPulledAt)}
              </TableCell>
              <TableCell>
                <Link
                  to="/t/$tenant/p/$project"
                  params={{ tenant: p.workspace.slug, project: p.slug }}
                  aria-label={m.admin_open_workspace()}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <ExternalLink className="size-4" />
                </Link>
              </TableCell>
            </TableRow>
          ))}
          {projects.length === 0 && <EmptyRow cols={7} />}
        </TableBody>
      </Table>
    </div>
  )
}

function EmptyRow({ cols }: { cols: number }) {
  return (
    <TableRow>
      <TableCell colSpan={cols} className="text-muted-foreground py-8 text-center">
        {m.admin_no_results()}
      </TableCell>
    </TableRow>
  )
}
