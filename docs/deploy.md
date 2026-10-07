# Deployment

Production: **https://wortwerk.li** on `one.adaptive-publishing.com` (Ubuntu 24.04, arm64), user `wortwerk`, checkout in `~/app`.

`docker-compose.prod.yml` runs `postgres`, a one-shot `migrate`, `web`, `worker`, `caddy` (TLS via Let's Encrypt, `www.` redirects) and `backup`. The image is built on the host, so no registry is involved.

## First-time setup

From a machine that can `ssh one` (ubuntu with sudo) and has `gh` logged in:

```sh
./deploy/bootstrap.sh
```

This is idempotent and:

1. creates the `wortwerk` user (in the `docker` group) with your keys plus a GitHub Actions key (`~/.ssh/wortwerk_actions`)
2. opens 80/443 in iptables and persists the rules
3. adds a read-only deploy key for the repo and the `DEPLOY_*` Actions secrets
4. clones the repo and writes `~/app/.env` (only if missing) with generated secrets and the Resend / OpenRouter keys from your local `.env`
5. runs the first deploy

If the site is unreachable from outside afterwards, check the Oracle Cloud VCN security list for ingress on 80/443.

## Continuous deployment

Every push to `main` runs CI. When it passes, the `deploy` job runs `~/app/deploy/deploy.sh <sha>` over SSH, which resets the checkout, rebuilds and restarts with `docker compose up -d --build --wait`. Migrations run before `web` and `worker` start.

Manual deploy or rollback: `ssh wortwerk@one.adaptive-publishing.com '~/app/deploy/deploy.sh <sha>'`.

## Operations

```sh
cd ~/app
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f web worker
```

Logs are rotated by Docker (5 × 10 MB per container).

Backups: `pg_dump` every night at 02:30 to `~/backups/wortwerk-YYYYMMDD-HHMM.dump`, kept for 14 days (`BACKUP_KEEP_DAYS`). Uploaded screenshots live in the `wortwerk_storage` volume. Both stay on the same host, so copy them elsewhere for real disaster recovery.

Restore:

```sh
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_restore -U wortwerk -d wortwerk --clean --if-exists < ~/backups/wortwerk-….dump
```

## GitHub App

Create it under the GitHub account or organisation that should own it (Settings → Developer settings → GitHub Apps → New):

- Homepage URL: `https://wortwerk.li`
- Callback URL: `https://wortwerk.li/api/integrations/github/callback`, and enable **Request user authorization (OAuth) during installation**. wortwerk uses it to verify that the installing user has access to the installation.
- Webhook URL: `https://wortwerk.li/api/webhooks/github`, with a random secret.
- Repository permissions: Contents **read & write**, Pull requests **read & write**, Metadata read.
- Subscribe to events: **Push**.

Then add the following to `~/app/.env` and redeploy:

```
GITHUB_APP_ID=…
GITHUB_APP_SLUG=…            # from the app's public URL
GITHUB_APP_CLIENT_ID=…
GITHUB_APP_CLIENT_SECRET=…
GITHUB_WEBHOOK_SECRET=…
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n…\n-----END RSA PRIVATE KEY-----\n"
```

## Bitbucket Cloud

Workspace settings → OAuth consumers → Add consumer:

- Callback URL: `https://wortwerk.li/api/integrations/bitbucket/callback`
- Permissions: Account read, Repositories write, Pull requests write, Webhooks read and write

Set `BITBUCKET_CLIENT_ID` (key) and `BITBUCKET_CLIENT_SECRET` (secret). wortwerk creates one webhook per connected repository with its own signing secret.

Bitbucket's API cannot force-push. The export branch therefore gets a new commit on top of its previous head instead of being regenerated from base.

## Platform admin

`/admin` lists all users, workspaces and projects, changes a workspace's plan and deletes users (together with the workspace they own). Access is limited to signed-in users with a verified email listed in `ADMIN_EMAILS` (comma separated) in `~/app/.env`. Everyone else gets a 404.
