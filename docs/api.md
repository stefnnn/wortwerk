# API

## Internal API

Used by the admin UI through the typed Hono client (`apps/web/src/lib/api.ts`). Session cookie auth, tenant resolved from the path, membership checked on every request.

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
/api/t/:tenant/projects/:project/machine            POST { locale, keyIds? } -> 202 machine run (agency plan)
/api/t/:tenant/projects/:project/tokens             GET, POST { name } -> { token } (shown once)
/api/t/:tenant/projects/:project/tokens/:id         DELETE

/api/integrations/github/callback                   GitHub App install callback (state + user OAuth code verified)
/api/integrations/bitbucket/callback                Bitbucket OAuth callback
/api/webhooks/github                                App webhook, X-Hub-Signature-256
/api/webhooks/bitbucket/:repoLinkId                 per-repository webhook, X-Hub-Signature with its own secret
```

Webhooks only enqueue a pull run with the pushed SHA. The worker skips SHAs it already synced, so redelivered or duplicate webhooks are harmless.

Errors: `{ "error": "not_found" | "conflict" | "invalid" | "limit_reached" | "http" | "internal", "message": "..." }` with status 404 / 409 / 400 / 402 / 4xx / 500.

## Public API v1

Implemented now (CI flow):

```
POST /api/v1/projects/:id/sync          { export?: boolean } -> 202 { runs: [{ id, kind, status }] }
GET  /api/v1/projects/:id/runs/:runId   -> { id, kind, status, result, error, createdAt, finishedAt }
```

```sh
curl -X POST https://wortwerk.li/api/v1/projects/$PROJECT_ID/sync \
  -H "Authorization: Bearer $WORTWERK_TOKEN" -H "Content-Type: application/json" -d '{"export": true}'
```

### Later (draft)

Versioned, token-authenticated, stable. Same domain services (`@wortwerk/core`) as the internal API, different auth and resource ids.

- Auth: `Authorization: Bearer ww_<token>`. Project tokens (phase 3, scoped to one project, used by CI) and personal tokens (later, all tenants of the user).
- Ids: projects addressed by `id`, keys by `id` or by `name` + `context` + `file` for CLI use.
- Pagination: `?limit=&cursor=`, responses `{ data: [...], nextCursor }`.

```
GET  /api/v1/projects/:id                                   project, locales, files
GET  /api/v1/projects/:id/files/:fileId/download?locale=    CLI pull
POST /api/v1/projects/:id/files/:fileId/upload?locale=      CLI push, returns sync run
GET  /api/v1/projects/:id/keys                              list with translations ?locale=
PUT  /api/v1/projects/:id/keys/:keyId/translations/:locale
```

CLI (`wortwerk push / pull`) reads a `wortwerk.json` with project id and file mappings and talks only to v1.
