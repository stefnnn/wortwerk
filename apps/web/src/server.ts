import handler, { createServerEntry } from '@tanstack/react-start/server-entry'
import { paraglideMiddleware } from './paraglide/server.js'
import { api } from '@wortwerk/api'

export default createServerEntry({
  fetch(request) {
    if (new URL(request.url).pathname.startsWith('/api/')) return api.fetch(request)
    return paraglideMiddleware(request, () => handler.fetch(request))
  },
})
