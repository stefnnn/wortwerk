import { createAccessControl } from 'better-auth/plugins/access'
import { adminAc, defaultStatements, memberAc, ownerAc } from 'better-auth/plugins/organization/access'

// shared by server and client; "guest" matches `guestRole` in @wortwerk/core
export const ac = createAccessControl(defaultStatements)

export const roles = {
  owner: ac.newRole(ownerAc.statements),
  admin: ac.newRole(adminAc.statements),
  member: ac.newRole(memberAc.statements),
  // content only: no workspace permissions at all, the project scope lives in `project_member`
  guest: ac.newRole({ organization: [], member: [], invitation: [], team: [], ac: [] }),
}
