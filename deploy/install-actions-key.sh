#!/bin/sh
# Run as root with the GitHub Actions public key on stdin. --existing reads the
# already authorized key, for upgrading a host without the local key file.
set -eu

auth=/home/wortwerk/.ssh/authorized_keys
if [ "${1:-}" = '--existing' ]; then
  key=$(awk '$NF == "github-actions-deploy@wortwerk" { print $(NF-2), $(NF-1), $NF }' "$auth")
else
  IFS= read -r key
fi

set -f
set -- $key
[ "$#" -eq 3 ] && [ "$1" = 'ssh-ed25519' ] && [ "$3" = 'github-actions-deploy@wortwerk' ] || {
  echo 'Expected the GitHub Actions ed25519 public key' >&2
  exit 1
}

tmp=$(mktemp "${auth}.XXXXXX")
trap 'rm -f "$tmp"' EXIT
awk -v material="$2" '$NF != "github-actions-deploy@wortwerk" && index($0, material) == 0' "$auth" > "$tmp"
printf 'restrict,command="/usr/local/libexec/wortwerk-deploy-command" %s\n' "$key" >> "$tmp"
chown wortwerk:wortwerk "$tmp"
chmod 600 "$tmp"
mv "$tmp" "$auth"
trap - EXIT
