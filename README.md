# wortwerk

Translation management with git flow. See [AGENTS.md](AGENTS.md) for decisions and [ROADMAP.md](ROADMAP.md) for phases.

## Layout

```
apps/web         TanStack Start app serving the API at /api/*, marketing site + admin UI (en/de)
apps/cli         `wortwerk` CLI (npm), device-flow login, pull / push / sync / lint
apps/worker      pg-boss consumer (imports, git pull / push, machine translation, auto-export sweep)
packages/api     Hono API: internal routes for the UI, public v1 (OpenAPI), auth, services
packages/db      Drizzle schema, migrations, client
packages/core    tenant-scoped domain services
packages/formats JSON / YAML / PO / TS+JS (static, never executed) adapters, ICU conversion
packages/git     GitHub App + Bitbucket Cloud clients, webhook signatures
packages/jobs    queue names + typed payloads
packages/mail    mail abstraction (console, Resend)
packages/storage storage abstraction (local disk)
```

## Development

Requires Node 24, pnpm 11, Docker.

```sh
cp .env.example .env          # set BETTER_AUTH_SECRET
pnpm install
pnpm db:up                    # Postgres on localhost:5434
pnpm db:migrate
pnpm dev                      # web on http://localhost:3010 + worker
```

Mails are printed to the web process log with `MAIL_DRIVER=console`.

```sh
pnpm test        # unit + integration tests (uses the wortwerk_test database)
pnpm lint
pnpm fmt
pnpm typecheck
pnpm db:generate # after schema changes
```

Integration tests create and reset a database named `*_test` only. Create it once with
`docker compose exec postgres psql -U wortwerk -c "create database wortwerk_test"`.

## Deployment

Production runs on https://wortwerk.li with Docker compose. See [docs/deploy.md](docs/deploy.md).

## License

wortwerk is licensed under the [GNU Affero General Public License v3.0](LICENSE) (`AGPL-3.0-only`).
The source code for the hosted service is available at [github.com/stefnnn/wortwerk](https://github.com/stefnnn/wortwerk).
