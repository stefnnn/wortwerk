# wortwerk

wortwerk is a translation management system with git flow.

- multi-tenant, stripe payment (phase 2), public website in en / de localized. admin ui in en / de
- plans: free / agency (CHF 500 / year). no limits on free for now, up to 10 users for agency, 500k keys
- hono / drizzleORM / sqlite / tanstack start / tanstack query / zod / pnpm / oxlint / oxfmt
- lucide icons / tailwind4 / shadcdn/ui with base-ui / basic light/dark theme system with tokens with primary color per tenant.
- git integration: github + bitbucket, behind an abstraction
- import / export translation files (po, json, yaml for now)
- multiple projects per tenant, multiple locales per project
- no access management for now, all users can do everything
- code repo on github.com/stefnnn/wortwerk -> ci/cd and deploy to "ssh one.adaptive-publishing.com", create user wortwerk there, ssh key, etc.
