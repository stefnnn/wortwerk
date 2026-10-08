import { createAuthClient } from 'better-auth/react'
import { magicLinkClient, organizationClient } from 'better-auth/client/plugins'
import { ac, roles } from '@wortwerk/api/roles'

export const authClient = createAuthClient({
  plugins: [
    magicLinkClient(),
    organizationClient({
      ac,
      roles,
      schema: { invitation: { additionalFields: { grants: { type: 'string', required: false } } } },
    }),
  ],
})
