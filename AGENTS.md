# wortwerk

wortwerk is a translation management system with git flow.

- multi-tenant, stripe payment (phase 2), public website in en / de localized. admin ui in en / de
- plans: free / project (CHF 450 / year) / agency (CHF 900 / year). free: 1 project, 1 user, 500 keys, no machine translation. project: 1 project, 3 users, 5k keys, machine translation. agency: unlimited projects, 10 users, 500k keys, machine translation. one owned workspace per user
- hono / drizzleORM / postgres / pg-boss / tanstack start / tanstack query / zod / pnpm / oxlint / oxfmt
- lucide icons / tailwind4 / shadcdn/ui with base-ui / light/dark theme system with tokens
- git integration: github + bitbucket cloud, behind an abstraction
- import / export translation files (po, json, yaml, ts/js object literals for now)
- multiple projects per tenant, multiple locales per project
- no role matrix for now: workspace members can do everything, guests are scoped to projects (see Platform)
- code repo on github.com/stefnnn/wortwerk -> ci/cd and deploy to "ssh one.adaptive-publishing.com" (user wortwerk), served at https://wortwerk.li, see docs/deploy.md

## Decisions

### Git sync

- split ownership: git owns keys and message structure (placeholders, markup, plural forms), source wording syncs both ways, wortwerk owns target translations (wortwerk -> repo)
- source text is merged three-way per key against `translation.repo_value` (the value last seen in the repo): repo-only changes are taken, wortwerk-only edits are kept and pushed, changes on both sides are a conflict where the repo wins and the wortwerk wording is kept in `source_conflict` for the user to re-apply or dismiss
- source edits in wortwerk may only change wording: placeholders, markup and plural forms must match the repo value (`structureIssue`), enforced in core and the editor
- keys of a repo-connected project are only added by developers in the repo, never in wortwerk
- a push first pulls if the tracked branch moved, then patches pending source edits into the repo's source file at that commit (`patchFile`, byte-for-byte for untouched entries) and lists them separately in the PR
- write-back via PR on a wortwerk branch, regenerated from base on every export (force-push, no merging); it carries target files and edited source text
- repo translations only fill gaps, marked needs review: all keys on the first pull, afterwards only keys that are new in that pull. explicit "import translations" re-runs the fill (optionally overwriting)
- one tracked branch per project
- sync trigger: provider webhooks + manual "sync now"
- keys missing from source are soft-deleted (obsolete, translations kept, restored if key returns), manual purge only
- file adapters preserve structure (key order, nesting, comments) to keep PR diffs minimal
- file mapping via path patterns with `%locale%` placeholders + locale alias mapping
- providers: GitHub App + Bitbucket Cloud OAuth consumer, behind an abstraction (read files at ref, commit to branch, open/update PR, verify webhook)

### Platform

- pnpm monorepo: `apps/web` (TanStack Start, mounts the Hono app from `packages/api` at `/api/*`), `apps/worker` (pg-boss consumers), `apps/cli` (the `wortwerk` npm CLI), shared `packages/*` (api routes + auth, db schema, domain logic, adapters)
- single Postgres DB, every tenant-owned table has `tenant_id`, all queries scoped through a helper
- background jobs: pg-boss, web only enqueues, worker processes. per-project serialization via a single `project` queue with pg-boss groups (`groupConcurrency: 1`), idempotent webhook handling
- auth: Better Auth (magic links never create accounts, sign-up is explicit), path-based tenant (`/t/:tenantSlug/...`), users can belong to multiple tenants
- guests: a workspace member with role `guest` only reaches the projects (and optionally locales) granted in `project_member`, can edit translations (all locales including source unless the grant lists some), comments and screenshots and use per-key machine translation there, and nothing else (no settings, keys, repo sync, bulk pre-translation, members). They are invited with a project selection (`invitation.grants`), count towards the plan's user limit, and don't get a workspace of their own. The scope is `Ctx.guest` (unset in the worker, webhooks and project-token contexts): core filters projects, keys and translation memory by it and checks locales on writes, and `requireTenant` only lets guests call the allow-listed routes in `packages/api/src/routes/context.ts` (new routes are members-only until added). In `/api/v1` guests only reach routes declared with `allow(scope, { guests: true })`
- plans modeled on the tenant from day one, limits (users, keys, machine translation) enforced in code; stripe only wires into this in phase 2
- email: Resend behind a mail abstraction (magic links, invites)
- file storage: local disk behind a storage abstraction (S3-compatible later)
- deploy: Docker compose on the host (web, worker, postgres)
- public website (en/de) lives in the same Start app as prerendered routes. User docs at `/docs` are Markdown in `apps/web/src/content/docs/{en,de}` (nav in `src/lib/docs-nav.ts`); the API reference page renders the v1 OpenAPI document, so documenting a route means `doc()` in `packages/api`, not editing the page
- theme: Radix Colors, `jade` accent + `sage` neutrals, light/dark scales mapped to tokens. no per-tenant colors

### Translations

- ICU MessageFormat is the canonical internal format; adapters convert PO plurals / i18next suffixes
- revisions stored per translation (who, when, value)
- review statuses: untranslated / translated / needs review / approved
- translation memory (tenant-wide), comments + screenshots per key
- machine translation via OpenRouter, model configurable (default `openai/gpt-6-luna`), paid plans only (project, agency), no quota for now. ICU placeholders protected in prompts and validated on output

### Public API and CLI

- `/api/v1` is the stable, versioned contract (OpenAPI at `/api/v1/openapi.json`); the internal `/api/t/:tenant` API stays free to change with the UI
- personal access tokens (`wwu_`, read or write, optionally one workspace, optional expiry) act as their user incl. guest scope; project tokens (`ww_`) are for CI: one project, read + sync
- CLI login is an OAuth device flow (RFC 8628) implemented in core; the personal token is minted when the CLI claims the approved code, never stored in plain text
- the CLI only talks to v1 and never adds keys to repo-connected projects (push of source files is refused there, `sync` instead)

### Phase 2

- stripe billing

## Conventions

- workspace packages are consumed as TypeScript source; relative imports use explicit `.ts` extensions and only erasable syntax (worker runs on Node type stripping)
- all tenant data access goes through `@wortwerk/core` with a `Ctx` (`tenantId`, `userId`); every query filters on `tenant_id`
- API routes validate with zod via `validate()` (v1: `input()` plus `doc()` for OpenAPI) and throw `DomainError`; the Hono error handler maps codes to HTTP status
- UI strings live in `apps/web/messages/{locale}.json` (Paraglide); German uses "du" and Swiss spelling (ss, no ß). Supported UI locales: en, de, fr, it, es, pt, hi, ja, zh. Only fill in `en.json`; all other locales are handled by wortwerk itself, so don't hand-edit them (missing messages fall back to English)
- tests that touch the database only run against databases whose name ends in `_test`
- git providers implement `GitClient` in `packages/git`; sync logic in `@wortwerk/core` only talks to that interface (tests use `createMemoryRepo`)
- web only enqueues jobs; anything touching a git provider or OpenRouter in bulk runs in the worker
