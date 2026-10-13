import { useEffect, useRef } from 'react'
import { useRouterState } from '@tanstack/react-router'
import { authClient } from '#/lib/auth-client.ts'
import { identifyAnalytics, trackFeature } from '#/lib/analytics.ts'
import type { Viewer } from '#/lib/viewer.ts'

export function Analytics() {
  const lastPage = useRef<string | undefined>(undefined)
  const { data: session, isPending } = authClient.useSession()
  const { tenant, pathname } = useRouterState({
    select: (state) => ({
      tenant: (state.matches.at(-1)?.context as { tenant?: Viewer['tenants'][number] } | undefined)?.tenant,
      pathname: state.resolvedLocation?.pathname ?? state.location.pathname,
    }),
  })
  useEffect(() => {
    if (isPending) return
    identifyAnalytics(session?.user ?? null, tenant)
    if (lastPage.current === pathname) return
    lastPage.current = pathname
    trackFeature('page_view', { path: pathname })
    if (/\/settings\/?$/.test(pathname)) {
      trackFeature('settings_opened', { scope: /\/p\//.test(pathname) ? 'project' : 'workspace' })
    }
  }, [pathname, session?.user, isPending, tenant])
  return null
}
