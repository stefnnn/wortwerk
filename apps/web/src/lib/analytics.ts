import { init, identify, reset, setTrackingConsent, track } from '@pug-sh/browser'
import type { Viewer } from './viewer.ts'

type Properties = Record<string, string | number | boolean>
let initialized = false
let userId: string | undefined
let context: Properties = {}

export function initAnalytics() {
  if (
    initialized ||
    typeof window === 'undefined' ||
    !import.meta.env.PROD ||
    window.location.hostname !== 'wortwerk.li'
  )
    return
  initialized = true
  init('db79c4jvk1qs73bjtqhg', {
    apiKey: 'pub_3a5f011bf05394da3f9e',
    // Page views are emitted after the router resolves account/workspace context.
    autoCapture: false,
    trackingConsent: 'cookieless',
    beforeSend: (event) => {
      Object.assign(event.customProperties, context)
      event.customProperties.surface = /\/t\//.test(window.location.pathname) ? 'app' : 'website'
      // Search terms, login codes and invitation tokens must never enter analytics.
      for (const key of ['$url', '$referrer']) {
        const value = event.autoProperties[key]
        if (value) {
          const url = new URL(value, window.location.origin)
          url.search = ''
          url.hash = ''
          url.pathname = url.pathname.replace(/(\/(?:invite|invitations)\/)[^/]+/, '$1:redacted')
          event.autoProperties[key] = url.toString()
        }
      }
      delete event.autoProperties.$pageTitle
      return event
    },
  })
}

export function identifyAnalytics(user: Viewer['user'] | null, tenant?: Viewer['tenants'][number]) {
  if (!initialized) return
  if (userId && userId !== user?.id) reset()
  userId = user?.id
  context = user
    ? {
        user_id: user.id,
        email: user.email,
        ...(tenant
          ? {
              org_id: tenant.id,
              org: tenant.name,
              org_slug: tenant.slug,
              plan: tenant.plan,
              role: tenant.role,
            }
          : {}),
      }
    : {}
  // Account sessions use identified analytics; signed-out visitors stay cookieless.
  setTrackingConsent(user ? 'granted' : 'cookieless')
  if (user) void identify(user.id, { name: user.name, ...context })
}

export function trackFeature(event: string, properties: Properties = {}) {
  if (initialized) track(event, properties)
}
