import { BitbucketOAuth } from './bitbucket.ts'
import { GitHubApp } from './github.ts'

export function providersFromEnv(env: Record<string, string | undefined> = process.env) {
  return {
    github:
      env.GITHUB_APP_ID && env.GITHUB_APP_PRIVATE_KEY
        ? new GitHubApp({
            appId: env.GITHUB_APP_ID,
            slug: env.GITHUB_APP_SLUG || 'wortwerk',
            privateKey: env.GITHUB_APP_PRIVATE_KEY,
            webhookSecret: env.GITHUB_WEBHOOK_SECRET ?? '',
            clientId: env.GITHUB_APP_CLIENT_ID,
            clientSecret: env.GITHUB_APP_CLIENT_SECRET,
            apiUrl: env.GITHUB_API_URL || undefined,
          })
        : undefined,
    bitbucket:
      env.BITBUCKET_CLIENT_ID && env.BITBUCKET_CLIENT_SECRET
        ? new BitbucketOAuth({ clientId: env.BITBUCKET_CLIENT_ID, clientSecret: env.BITBUCKET_CLIENT_SECRET })
        : undefined,
  }
}
