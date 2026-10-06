import { Link, useNavigate, useRouter } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ChevronsUpDown, FolderKanban, LogOut, Menu, Plus, Settings } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Logo } from '#/components/brand.tsx'
import { LocaleSwitch, ThemeToggle } from '#/components/preferences.tsx'
import { Avatar, AvatarFallback } from '#/components/ui/avatar.tsx'
import { Button } from '#/components/ui/button.tsx'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu.tsx'
import { Sheet, SheetContent, SheetTitle } from '#/components/ui/sheet.tsx'
import { authClient } from '#/lib/auth-client.ts'
import { queries } from '#/lib/queries.ts'
import { cn } from '#/lib/utils.ts'
import type { Viewer } from '#/lib/viewer.ts'
import { m } from '#/paraglide/messages.js'

type Tenant = Viewer['tenants'][number]

export function AppShell({
  viewer,
  tenant,
  children,
}: {
  viewer: Viewer
  tenant: Tenant
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="flex min-h-dvh">
      <aside className="bg-sidebar sticky top-0 hidden h-dvh w-64 shrink-0 border-r md:block">
        <Sidebar viewer={viewer} tenant={tenant} />
      </aside>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="bg-sidebar w-72 p-0">
          <SheetTitle className="sr-only">{m.nav_menu()}</SheetTitle>
          <Sidebar viewer={viewer} tenant={tenant} onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b px-4 py-3 md:hidden">
          <Button variant="ghost" size="icon" onClick={() => setOpen(true)} aria-label={m.nav_menu()}>
            <Menu />
          </Button>
          <Logo />
        </header>
        <main className="flex-1">{children}</main>
      </div>
    </div>
  )
}

function Sidebar({
  viewer,
  tenant,
  onNavigate,
}: {
  viewer: Viewer
  tenant: Tenant
  onNavigate?: () => void
}) {
  const projects = useQuery(queries.projects(tenant.slug))
  const linkClass =
    'flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground'
  const activeClass = 'bg-sidebar-accent font-medium text-sidebar-foreground'

  return (
    <div className="flex h-full flex-col gap-4 p-3">
      <div className="px-1.5 pt-1">
        <Logo />
      </div>
      <TenantSwitcher viewer={viewer} tenant={tenant} />
      <nav className="flex flex-col gap-0.5">
        <Link
          to="/t/$tenant"
          params={{ tenant: tenant.slug }}
          activeOptions={{ exact: true }}
          className={linkClass}
          activeProps={{ className: activeClass }}
          onClick={onNavigate}
        >
          <FolderKanban className="size-4" /> {m.nav_projects()}
        </Link>
        <Link
          to="/t/$tenant/settings"
          params={{ tenant: tenant.slug }}
          className={linkClass}
          activeProps={{ className: activeClass }}
          onClick={onNavigate}
        >
          <Settings className="size-4" /> {m.nav_settings()}
        </Link>
      </nav>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <p className="text-muted-foreground px-2.5 pb-1.5 text-xs font-medium">{m.nav_projects()}</p>
        <div className="flex flex-col gap-0.5">
          {projects.data?.map((p) => (
            <Link
              key={p.id}
              to="/t/$tenant/p/$project"
              params={{ tenant: tenant.slug, project: p.slug }}
              className={cn(linkClass, 'truncate')}
              activeProps={{ className: activeClass }}
              onClick={onNavigate}
            >
              <span className="bg-primary size-1.5 shrink-0 rounded-full" /> {p.name}
            </Link>
          ))}
        </div>
      </div>
      <UserMenu viewer={viewer} />
    </div>
  )
}

function TenantSwitcher({ viewer, tenant }: { viewer: Viewer; tenant: Tenant }) {
  const navigate = useNavigate()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button className="bg-background hover:bg-muted flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-sm" />
        }
      >
        <span className="bg-accent text-accent-foreground flex size-6 items-center justify-center rounded-md text-xs font-semibold">
          {tenant.name.slice(0, 1).toUpperCase()}
        </span>
        <span className="flex-1 truncate font-medium">{tenant.name}</span>
        <ChevronsUpDown className="text-muted-foreground size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{m.nav_workspaces()}</DropdownMenuLabel>
          {viewer.tenants.map((t) => (
            <DropdownMenuItem
              key={t.id}
              onClick={() => navigate({ to: '/t/$tenant', params: { tenant: t.slug } })}
            >
              {t.name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        {!viewer.tenants.some((t) => t.role === 'owner') && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate({ to: '/onboarding' })}>
              <Plus /> {m.nav_new_workspace()}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function UserMenu({ viewer }: { viewer: Viewer }) {
  const router = useRouter()
  const initials = (viewer.user.name || viewer.user.email).slice(0, 2).toUpperCase()
  const signOut = async () => {
    await authClient.signOut()
    await router.navigate({ to: '/' })
  }
  return (
    <div className="flex items-center gap-1 border-t pt-3">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button className="hover:bg-sidebar-accent flex min-w-0 flex-1 items-center gap-2 rounded-md p-1.5 text-left" />
          }
        >
          <Avatar className="size-7">
            <AvatarFallback className="text-xs">{initials}</AvatarFallback>
          </Avatar>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{viewer.user.name}</span>
            <span className="text-muted-foreground block truncate text-xs">{viewer.user.email}</span>
          </span>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" className="w-56">
          <DropdownMenuItem onClick={signOut}>
            <LogOut /> {m.nav_sign_out()}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <LocaleSwitch />
      <ThemeToggle />
    </div>
  )
}
