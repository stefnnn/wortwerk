---
title: API
description: Authenticate with a token, understand scopes and errors, and page through keys. Every endpoint is listed in the API reference.
---

The public API lives at `https://wortwerk.li/api/v1`. It speaks JSON, is versioned in the path, and is the same API the CLI uses. The [API reference](/docs/api/reference) lists every endpoint with its parameters, schemas and examples, and the machine-readable OpenAPI 3.1 document is at [`/api/v1/openapi.json`](https://wortwerk.li/api/v1/openapi.json).

```sh
curl https://wortwerk.li/api/v1/me \
  -H "Authorization: Bearer $WORTWERK_TOKEN"
```

## Tokens

Every request carries a bearer token. There are two kinds:

|            | Personal access token                     | Project token                          |
| ---------- | ----------------------------------------- | -------------------------------------- |
| Prefix     | `wwu_`                                    | `ww_`                                  |
| Created in | **Account & API**, or by `wortwerk login` | project settings, **CI tokens**        |
| Acts as    | you, with your workspaces and roles       | the project, without a user            |
| Reach      | all your workspaces, or one               | one project                            |
| Access     | read only, or read & write                | read and sync                          |
| Expires    | after 30, 90 or 365 days, or never        | never, revoke it when no longer needed |

Use **project tokens** for CI: they can't change translations or settings, and they stop working when the project is deleted. Use **personal tokens** for scripts that act on your behalf: edits made with them show up under your name in the translation history.

Tokens are shown once when you create them. wortwerk only keeps a hash, and the token list shows the prefix and when each token was last used.

### Scopes

| Scope | Allowed for                                  | Endpoints                                                                                      |
| ----- | -------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| read  | all tokens                                   | everything that only reads: projects, keys, stats, file downloads, runs                        |
| write | personal read & write tokens                 | translations, keys, locales, file mappings and uploads, machine translation, creating projects |
| sync  | personal read & write tokens, project tokens | starting syncs and exports                                                                     |

### Guests

A personal token of a guest has exactly the guest's access: only the granted projects, edits only in the granted languages, and only the content endpoints (reading projects, stats and keys, and setting translations). Everything else answers with `403`.

## Errors

Errors have an HTTP status and a JSON body:

```json
{ "error": "not_found", "message": "Project not found" }
```

| Status | `error`         | When                                                                                   |
| ------ | --------------- | -------------------------------------------------------------------------------------- |
| 400    | `invalid`       | validation failed, the message names the field                                         |
| 401    | `http`          | token missing, unknown, revoked or expired                                             |
| 402    | `limit_reached` | your plan's limit (projects, keys, users) is reached, or the feature needs a paid plan |
| 403    | `forbidden`     | the token lacks the scope, or guests can't use the endpoint                            |
| 404    | `not_found`     | doesn't exist, or the token can't see it                                               |
| 409    | `conflict`      | e.g. a key or project slug that already exists                                         |

## Pagination

Lists that can grow large, such as keys, return one page and a cursor:

```json
{ "data": [ … ], "total": 1250, "nextCursor": "MTAw" }
```

Pass `nextCursor` as `cursor` to get the next page, until it is `null`. `limit` sets the page size (up to 200).

## Background jobs

Syncs, exports, uploads and machine translation run in the background. The API answers with `202 Accepted` and a **run**:

```json
{ "id": "…", "kind": "pull", "status": "queued" }
```

Poll `GET /projects/{projectId}/runs/{runId}` until `status` is `succeeded` or `failed`. `result` then holds counts such as added keys or changed translations, and `error` explains failures.

## Common tasks

Look up a key by name and set its German translation:

```sh
KEY=$(curl -s "https://wortwerk.li/api/v1/projects/$PROJECT_ID/keys?locale=de&name=cart.title" \
  -H "Authorization: Bearer $WORTWERK_TOKEN" | jq -r '.data[0].id')

curl -X PUT "https://wortwerk.li/api/v1/projects/$PROJECT_ID/keys/$KEY/translations/de" \
  -H "Authorization: Bearer $WORTWERK_TOKEN" -H "Content-Type: application/json" \
  -d '{"value": "Warenkorb", "status": "approved"}'
```

Download a file in one language. The `x-wortwerk-path` header holds its path in the repository:

```sh
curl "https://wortwerk.li/api/v1/projects/$PROJECT_ID/files/$FILE_ID/download?locale=fr" \
  -H "Authorization: Bearer $WORTWERK_TOKEN" -o locales/fr.json
```

Trigger a sync and an export from CI:

```sh
curl -X POST "https://wortwerk.li/api/v1/projects/$PROJECT_ID/sync" \
  -H "Authorization: Bearer $WORTWERK_TOKEN" -H "Content-Type: application/json" \
  -d '{"export": true}'
```
