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

wortwerk is source available under the [Functional Source License, Version 1.1, Apache 2.0 Future License](LICENSE) (`FSL-1.1-ALv2`).
You can use, modify and self-host it for any purpose except offering a competing commercial product or service, and each version converts to Apache 2.0 two years after its release.
See [wortwerk.li/self-hosting](https://wortwerk.li/self-hosting) to run it yourself.
