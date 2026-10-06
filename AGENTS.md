# wortwerk

wortwerk is a translation management system with git flow.

- multi-tenant, stripe payment (phase 2), public website in en / de localized. admin ui in en / de
- plans: free / project (CHF 450 / year) / agency (CHF 900 / year). free: 1 project, 1 user, 500 keys, no machine translation. project: 1 project, 3 users, 5k keys, machine translation. agency: unlimited projects, 10 users, 500k keys, machine translation. one owned workspace per user
- hono / drizzleORM / postgres / pg-boss / tanstack start / tanstack query / zod / pnpm / oxlint / oxfmt
- lucide icons / tailwind4 / shadcdn/ui with base-ui / light/dark theme system with tokens
- git integration: github + bitbucket cloud, behind an abstraction
- import / export translation files (po, json, yaml for now)
- multiple projects per tenant, multiple locales per project
- no access management for now, all users can do everything
- code repo on github.com/stefnnn/wortwerk -> ci/cd and deploy to "ssh one.adaptive-publishing.com" (user wortwerk), served at https://wortwerk.li, see docs/deploy.md

## Decisions

### Git sync

- split ownership: git owns keys + source-locale text (repo -> wortwerk), wortwerk owns target translations (wortwerk -> repo)
- write-back via PR on a wortwerk branch, regenerated from base on every export (force-push, no merging)
- opt-in "import translations from repo" for onboarding / manual fixes
- one tracked branch per project
- sync trigger: provider webhooks + manual "sync now"
- keys missing from source are soft-deleted (obsolete, translations kept, restored if key returns), manual purge only
- file adapters preserve structure (key order, nesting, comments) to keep PR diffs minimal
- file mapping via path patterns with `%locale%` placeholders + locale alias mapping
- providers: GitHub App + Bitbucket Cloud OAuth consumer, behind an abstraction (read files at ref, commit to branch, open/update PR, verify webhook)

### Platform

- pnpm monorepo: `apps/web` (TanStack Start with Hono mounted at `/api/*`), `apps/worker` (pg-boss consumers), shared `packages/*` (db schema, domain logic, adapters)
- single Postgres DB, every tenant-owned table has `tenant_id`, all queries scoped through a helper
- background jobs: pg-boss, web only enqueues, worker processes. per-project serialization via a single `project` queue with pg-boss groups (`groupConcurrency: 1`), idempotent webhook handling
- auth: Better Auth (magic links never create accounts, sign-up is explicit), path-based tenant (`/t/:tenantSlug/...`), users can belong to multiple tenants
- plans modeled on the tenant from day one, limits (users, keys, machine translation) enforced in code; stripe only wires into this in phase 2
- email: Resend behind a mail abstraction (magic links, invites)
- file storage: local disk behind a storage abstraction (S3-compatible later)
- deploy: Docker compose on the host (web, worker, postgres)
- public website (en/de) lives in the same Start app as prerendered routes
- theme: Radix Colors, `jade` accent + `sage` neutrals, light/dark scales mapped to tokens. no per-tenant colors

### Translations

- ICU MessageFormat is the canonical internal format; adapters convert PO plurals / i18next suffixes
- revisions stored per translation (who, when, value)
- review statuses: untranslated / translated / needs review / approved
- translation memory (tenant-wide), comments + screenshots per key
- machine translation via OpenRouter, model configurable (default `openai/gpt-6-luna`), paid plans only (project, agency), no quota for now. ICU placeholders protected in prompts and validated on output

### Phase 2

- stripe billing
- CLI and public API, except for what webhooks and basic CI flows need (phase 1: provider webhooks + a project-token "trigger sync" endpoint)

## Conventions

- workspace packages are consumed as TypeScript source; relative imports use explicit `.ts` extensions and only erasable syntax (worker runs on Node type stripping)
- all tenant data access goes through `@wortwerk/core` with a `Ctx` (`tenantId`, `userId`); every query filters on `tenant_id`
- API routes validate with zod via `validate()` and throw `DomainError`; the Hono error handler maps codes to HTTP status
- UI strings live in `apps/web/messages/{en,de}.json` (Paraglide); German uses "du" and Swiss spelling (ss, no ß)
- tests that touch the database only run against databases whose name ends in `_test`
- git providers implement `GitClient` in `packages/git`; sync logic in `@wortwerk/core` only talks to that interface (tests use `createMemoryRepo`)
- web only enqueues jobs; anything touching a git provider or OpenRouter in bulk runs in the worker
