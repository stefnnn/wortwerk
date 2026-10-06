# wortwerk

Translation management with git flow. See [AGENTS.md](AGENTS.md) for decisions and [ROADMAP.md](ROADMAP.md) for phases.

## Layout

```
apps/web         TanStack Start app, Hono API at /api/*, marketing site + admin UI (en/de)
apps/worker      pg-boss consumer (imports, later git sync / exports / machine translation)
packages/db      Drizzle schema, migrations, client
packages/core    tenant-scoped domain services
packages/formats JSON / YAML / PO adapters, ICU conversion
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
