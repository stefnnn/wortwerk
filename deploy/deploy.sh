#!/bin/sh
# Runs on the host as the wortwerk user: ./deploy/deploy.sh [git-ref]
set -eu
cd "$(dirname "$0")/.."
git fetch --quiet origin main
git reset --quiet --hard "${1:-origin/main}"
docker compose -f docker-compose.prod.yml up -d --build --remove-orphans --wait
docker image prune -f >/dev/null
echo "deployed $(git rev-parse --short HEAD)"
