import {
  checkRepoAccess,
  claimRepoAccessAlert,
  listRepoLinksForAccessCheck,
  listWorkspaceOwners,
  releaseRepoAccessAlert,
  repoAccessFixUrl,
  type Ctx,
  type GitProviders,
} from '@wortwerk/core'
import type { Db } from '@wortwerk/db'
import { repoAccessLostMail, type Mailer } from '@wortwerk/mail'
import type { Storage } from '@wortwerk/storage'

type Options = { db: Db; storage: Storage; providers: GitProviders; mailer: Mailer; appUrl: string }

export async function sweepRepoAccess({ db, storage, providers, mailer, appUrl }: Options) {
  const links = await listRepoLinksForAccessCheck(db)
  let lost = 0
  for (const link of links) {
    try {
      const ctx: Ctx = { db, tenantId: link.tenantId, storage }
      if (await checkRepoAccess(ctx, providers, link)) continue
      lost++
      if (!(await claimRepoAccessAlert(db, link.tenantId, link.projectId))) continue
      const url = repoAccessFixUrl(link) ?? `${appUrl}/t/${link.tenantSlug}/p/${link.projectSlug}/settings`
      const owners = await listWorkspaceOwners(db, link.tenantId)
      const results = await Promise.allSettled(
        owners.map((owner) =>
          mailer.send(repoAccessLostMail(owner.email, { project: link.projectName, repo: link.repo, url })),
        ),
      )
      const failures = results.filter((result) => result.status === 'rejected')
      for (const failure of failures)
        console.warn(`[worker] access alert project=${link.projectId}: ${failure.reason}`)
      // only a total failure releases the claim, so a retry never mails owners who already received it
      if (failures.length === results.length) await releaseRepoAccessAlert(db, link.tenantId, link.projectId)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn(`[worker] access check project=${link.projectId} failed: ${message}`)
    }
  }
  console.info(`[worker] access sweep checked ${links.length} repositories, ${lost} without access`)
}
