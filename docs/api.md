# API

## Internal API

Lives in `packages/api` and is mounted by `apps/web` at `/api/*`. Used by the admin UI through the typed Hono client (`apps/web/src/lib/api.ts`). Session cookie auth, tenant resolved from the path, membership checked on every request.

```
/api/auth/*                                         Better Auth (sessions, magic link, organizations, invitations)
/api/health

/api/t/:tenant                                      GET tenant + plan + usage
/api/t/:tenant/projects                             GET list, POST create
/api/t/:tenant/projects/:project                    GET, PATCH, DELETE
/api/t/:tenant/projects/:project/stats              GET per-locale progress
/api/t/:tenant/projects/:project/locales            POST add
/api/t/:tenant/projects/:project/locales/:code      DELETE
/api/t/:tenant/projects/:project/files              POST create / update mapping
/api/t/:tenant/projects/:project/files/:id          DELETE
/api/t/:tenant/projects/:project/files/:id/export   GET ?locale=  (file download)
/api/t/:tenant/projects/:project/imports            POST multipart (file, locale, fileId | path, overwrite) -> 202 sync run
/api/t/:tenant/projects/:project/runs[/:id]         GET sync runs
/api/t/:tenant/projects/:project/keys               GET ?locale&status&search&fileId&obsolete&limit&offset, POST create
/api/t/:tenant/projects/:project/keys/obsolete      POST { keyIds, obsolete }
/api/t/:tenant/projects/:project/keys/purge         POST
/api/t/:tenant/keys/:keyId                          PATCH { description }
/api/t/:tenant/keys/:keyId/translations/:locale     PUT { value, status? }
/api/t/:tenant/keys/:keyId/translations/:locale/revisions   GET
/api/t/:tenant/keys/:keyId/suggestions              GET ?locale  (translation memory)
/api/t/:tenant/keys/:keyId/comments                 GET, POST
/api/t/:tenant/comments/:id                         DELETE
/api/t/:tenant/keys/:keyId/screenshots              GET, POST multipart
/api/t/:tenant/screenshots/:id                      GET (image), DELETE
/api/t/:tenant/keys/:keyId/machine                  POST { locale } -> { value }  (MT suggestion, not saved)

/api/t/:tenant/git/connections                      GET connections + configured providers
/api/t/:tenant/git/connections/:id                  DELETE
/api/t/:tenant/git/connections/:id/repos            GET repositories visible to the connection
/api/t/:tenant/git/connect/:provider                GET -> redirect to GitHub App install / Bitbucket OAuth
/api/t/:tenant/projects/:project/repo               GET, PUT { connectionId, repo, branch, exportBranch, localeAliases, autoExport }, DELETE
/api/t/:tenant/projects/:project/repo/sync          POST { importTranslations, overwrite } -> 202 pull run
/api/t/:tenant/projects/:project/repo/export        POST -> 202 push run
/api/t/:tenant/projects/:project/machine            POST { locale, keyIds? | selection? } -> 202 machine run (paid plans)
/api/t/:tenant/projects/:project/tokens             GET, POST { name } -> { token } (shown once)
/api/t/:tenant/projects/:project/tokens/:id         DELETE

/api/account/tokens                                 GET, POST { name, access, tenantId | null, expiresInDays | null } -> { token } (shown once)
/api/account/tokens/:id                             DELETE
/api/account/device/:userCode                       GET pending CLI login, POST { approve } (the /device page)

/api/integrations/github/callback                   GitHub App install callback (state + user OAuth code verified)
/api/integrations/bitbucket/callback                Bitbucket OAuth callback
/api/webhooks/github                                App webhook, X-Hub-Signature-256
/api/webhooks/bitbucket/:repoLinkId                 per-repository webhook, X-Hub-Signature with its own secret
```

Webhooks only enqueue a pull run with the pushed SHA. The worker skips SHAs it already synced, so redelivered or duplicate webhooks are harmless.

Errors: `{ "error": "not_found" | "conflict" | "invalid" | "limit_reached" | "http" | "internal", "message": "..." }` with status 404 / 409 / 400 / 402 / 4xx / 500.

## Public API v1

`/api/v1`, versioned and token-authenticated. Same domain services (`@wortwerk/core`) as the internal API, projects addressed by id. OpenAPI document at `/api/v1/openapi.json`, interactive reference at `/api/v1/docs`.

### Tokens

`Authorization: Bearer <token>`:

- personal access tokens `wwu_…` (account page or `wortwerk login`): act as their user, so memberships, guest scope (`Ctx.guest`) and revision authorship apply. Access `read` or `write`, optionally limited to one workspace, optional expiry. Stored as sha256 hashes in `api_token`
- project tokens `ww_…` (project settings, for CI): one project, read + sync only, no user (`Ctx.userId` unset)

Scopes per route: `read` (personal read/write, project), `write` (personal write), `sync` (personal write, project). Guests reach only routes that opt in (project, stats, keys, set translation); everything else is members-only, mirroring the internal guest allow-list.

### CLI login (device flow, RFC 8628)

1. `POST /auth/device { clientName }` -> `{ deviceCode, userCode, verificationUriComplete, interval, expiresIn }` (10 min)
2. the user opens `/device?code=XXXX-XXXX`, signs in and approves (`POST /api/account/device/:userCode`)
3. the CLI polls `POST /auth/token { deviceCode }`: 400 `authorization_pending` / `slow_down` / `access_denied` / `expired_token`, then once 200 `{ token, user }`. The personal token (write, all workspaces, 1 year) is created at that moment, so no plaintext token is ever stored

### Endpoints

```
POST   /auth/device                                     start a device login (no token)
POST   /auth/token                                      poll a device login (no token)
GET    /me                                              token, user, workspaces
DELETE /me/token                                        revoke the calling personal token (logout)

GET    /workspaces                                      personal tokens only
GET    /workspaces/:workspace                           slug or id, plan + usage
GET    /workspaces/:workspace/projects
POST   /workspaces/:workspace/projects                  { name, slug, sourceLocale, locales }

GET    /projects/:id                                    locales, files, repo (provider, repo, branch, localeAliases)
GET    /projects/:id/stats                              per-locale progress
POST   /projects/:id/locales                            { code }
DELETE /projects/:id/locales/:code
POST   /projects/:id/files                              { path, format? } file mapping
GET    /projects/:id/files/:fileId/download?locale=     raw file, x-wortwerk-path = path in the repo (aliases applied)
POST   /projects/:id/files/:fileId/import?locale=&overwrite=   raw body -> 202 import run. Not for the source of repo-connected projects
GET    /projects/:id/keys?locale=&status=&search=&name=&fileId=&limit=&cursor=   { data, total, nextCursor }
POST   /projects/:id/keys                               only without a repository
PUT    /projects/:id/keys/:keyId/translations/:locale   { value, status? }
POST   /projects/:id/sync                               { export? } -> 202 { runs }
POST   /projects/:id/machine                            { locale } -> 202 run (paid plans)
GET    /projects/:id/runs
GET    /projects/:id/runs/:runId
```

```sh
curl -X POST https://wortwerk.li/api/v1/projects/$PROJECT_ID/sync \
  -H "Authorization: Bearer $WORTWERK_TOKEN" -H "Content-Type: application/json" -d '{"export": true}'
```

Cursors are opaque (currently an encoded offset). Routes are documented with `doc()` and validated with `input()` from `packages/api/src/routes/v1/docs.ts`, which feed the OpenAPI document.

## CLI

`apps/cli`, published to npm as `wortwerk` (bundled with tsdown; the format parsers stay runtime dependencies). It talks only to v1 through a typed `hc<V1>` client. `wortwerk.json` at the project root holds the project id and a cache of its locales and file mappings (refreshed by `init`, `pull`, `push`) so `lint` works offline. Credentials live in `~/.config/wortwerk/credentials.json` (0600); `WORTWERK_TOKEN` and `WORTWERK_HOST` override them, e.g. in CI.

```
wortwerk login | logout | whoami
wortwerk init                     link the folder to a project, detect %locale% file patterns
wortwerk pull [-l de,fr] [--source]
wortwerk push [-l de] [--overwrite]   source by default, refused for repo-connected projects
wortwerk sync [--export]          pull the repository, optionally export a PR
wortwerk status | check --min 100 [--approved]
wortwerk lint [--strict]          offline ICU / placeholder / markup / plural checks
wortwerk keys [search] | translate <key> [value] -l de | mt <locale> | open
```
