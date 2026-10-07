#!/bin/sh
# Forced command for the GitHub Actions SSH key. Install outside the checkout,
# owned by root, so a deploy cannot change the command's validation.
set -eu

prefix='~/app/deploy/deploy.sh '
case "${SSH_ORIGINAL_COMMAND:-}" in
  "$prefix"*) sha=${SSH_ORIGINAL_COMMAND#"$prefix"} ;;
  *) echo 'Only the GitHub Actions deploy command is allowed' >&2; exit 1 ;;
esac

case "$sha" in
  ''|*[!0-9a-f]*) echo 'Invalid commit' >&2; exit 1 ;;
esac
[ "${#sha}" -eq 40 ] || { echo 'Invalid commit' >&2; exit 1; }

cd /home/wortwerk/app
git fetch --quiet origin main
[ "$(git rev-parse FETCH_HEAD)" = "$sha" ] || {
  echo 'The deploy commit is no longer the tip of main' >&2
  exit 1
}

exec /home/wortwerk/app/deploy/deploy.sh "$sha"
