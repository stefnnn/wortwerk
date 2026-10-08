# Roadmap

## Phase 1 — Foundation ✅

- pnpm monorepo, TypeScript, oxlint / oxfmt, vitest
- docker compose for local Postgres
- `packages/db`: Drizzle schema (auth, tenants + plans, projects, locales, keys, translations, revisions, comments, screenshots, sync runs), migrations, tenant-scoped helpers
- `packages/mail` (Resend + console driver), `packages/storage` (local disk driver), `packages/jobs` (pg-boss queues + typed payloads)
- `apps/web`: TanStack Start + Hono at `/api/*`, Better Auth (magic link, password, organizations = tenants, invitations), Radix jade/sage theme with light/dark, admin + website en/de via Paraglide
- `apps/worker`: pg-boss consumer process
- GitHub Actions CI: lint, format check, typecheck, test

## Phase 2 — Core TMS ✅

- `packages/formats`: JSON (nested/flat, i18next plurals), YAML (Rails style), PO adapters, structure-preserving export, ICU canonical conversion
- `packages/core`: projects, locales, keys, translations, statuses, revisions, translation memory, comments, screenshots, plan limits
- Hono API (`/api/t/:tenant/...`) with zod validation and a typed `hc` client
- admin UI: onboarding, project list, translation editor (filters, statuses, history, TM suggestions, comments, screenshots), project settings (locales, import / export), tenant settings (members, invites, plan)
- file import / export run as worker jobs, tracked as sync runs

## Phase 3 — Git integration ✅

- git provider abstraction: read files at ref, commit to branch, open / update PR, verify webhook
- GitHub App + Bitbucket Cloud OAuth consumer
- per-project repo connection, tracked branch, file mapping patterns with `%locale%` + locale aliases
- webhook ingestion -> source sync job (new keys, changed source -> needs review, missing -> obsolete)
- export job: regenerate `wortwerk/translations` branch from base, force-push, open / update PR, auto-export once edits have been quiet for a minute
- project tokens + `POST /api/v1/projects/:id/sync` for CI

## Phase 4 — Machine translation & launch ✅

- OpenRouter machine translation (configurable model, default `gpt-6-luna`), agency plan only, ICU placeholder protection + validation, bulk pre-translate job
- public website content en / de, prerendered
- production deploy to https://wortwerk.li: docker compose on one.adaptive-publishing.com (`wortwerk` user, ssh key), GitHub Actions CD, Caddy / TLS, Postgres backups
- logs via Docker (rotated); external error monitoring later

## Phase 5 — API & CLI ✅

- `packages/api`: Hono routes, auth and services extracted from `apps/web`
- public API v1 with OpenAPI + reference docs, personal access tokens (account page), scoped project tokens
- device-flow login and the `wortwerk` CLI: init (file pattern detection), pull / push, sync, status / check, offline lint, keys / translate, mt

## Later

- error monitoring (Sentry or similar), off-host backups
- imprint / privacy pages for the public site

- Stripe billing on top of the existing plan model
- publish the CLI to npm, rate limits for v1, keychain storage for CLI credentials
- S3 storage driver, branch-aware keys, access management
