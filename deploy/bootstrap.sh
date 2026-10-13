#!/usr/bin/env bash
# One-time production setup, run from a laptop that can `ssh $ADMIN_HOST` with sudo.
# Idempotent: safe to re-run. Usage: ./deploy/bootstrap.sh
set -euo pipefail

ADMIN_HOST=${ADMIN_HOST:-one}
HOST=${HOST:-one.adaptive-publishing.com}
DOMAIN=${DOMAIN:-wortwerk.li}
REPO=${REPO:-stefnnn/wortwerk}
KEY=${KEY:-$HOME/.ssh/wortwerk_actions}
cd "$(dirname "$0")/.."

echo "==> GitHub Actions deploy key ($KEY)"
[ -f "$KEY" ] || ssh-keygen -q -t ed25519 -N '' -C 'github-actions-deploy@wortwerk' -f "$KEY"

echo "==> host: wortwerk user, ssh keys, firewall"
REPO_KEY=$(ssh "$ADMIN_HOST" "sudo bash -s" <<EOF
set -euo pipefail
id wortwerk >/dev/null 2>&1 || useradd -m -s /bin/bash -G docker wortwerk
install -d -m 700 -o wortwerk -g wortwerk /home/wortwerk/.ssh
keys=/home/wortwerk/.ssh/authorized_keys
touch \$keys
for k in "\$(cat /home/ubuntu/.ssh/authorized_keys)"; do
  printf '%s\n' "\$k" | while read -r line; do
    [ -n "\$line" ] && ! grep -qxF "\$line" \$keys && echo "\$line" >> \$keys
  done
done
chown wortwerk:wortwerk \$keys && chmod 600 \$keys
[ -f /home/wortwerk/.ssh/id_ed25519 ] || sudo -u wortwerk ssh-keygen -q -t ed25519 -N '' -C 'wortwerk@one repo key' -f /home/wortwerk/.ssh/id_ed25519
sudo -u wortwerk sh -c 'ssh-keyscan -t ed25519 github.com 2>/dev/null >> ~/.ssh/known_hosts; sort -u -o ~/.ssh/known_hosts ~/.ssh/known_hosts'
for rule in "-p tcp --dport 80" "-p tcp --dport 443" "-p udp --dport 443"; do
  iptables -C INPUT \$rule -m state --state NEW -j ACCEPT 2>/dev/null || iptables -I INPUT 5 \$rule -m state --state NEW -j ACCEPT
done
command -v netfilter-persistent >/dev/null && netfilter-persistent save >/dev/null 2>&1 || true
cat /home/wortwerk/.ssh/id_ed25519.pub
EOF
)

echo "==> install restricted GitHub Actions deploy command"
ssh "$ADMIN_HOST" 'sudo install -D -o root -g root -m 755 /dev/stdin /usr/local/libexec/wortwerk-deploy-command' < deploy/ssh-deploy-command.sh
ssh "$ADMIN_HOST" 'sudo install -D -o root -g root -m 755 /dev/stdin /usr/local/libexec/wortwerk-install-actions-key' < deploy/install-actions-key.sh
ssh "$ADMIN_HOST" 'sudo /usr/local/libexec/wortwerk-install-actions-key' < "$KEY.pub"

echo "==> GitHub: read-only deploy key + Actions secrets"
gh repo deploy-key list -R "$REPO" | grep -q 'wortwerk@one' || \
  gh repo deploy-key add - -R "$REPO" --title 'wortwerk@one' <<<"$REPO_KEY"
gh secret set DEPLOY_SSH_KEY -R "$REPO" < "$KEY"
gh secret set DEPLOY_KNOWN_HOSTS -R "$REPO" --body "$(ssh-keyscan -t ed25519 "$HOST" 2>/dev/null)"
gh secret set DEPLOY_TARGET -R "$REPO" --body "wortwerk@$HOST"

echo "==> host: clone"
ssh -i "$KEY" "wortwerk@$HOST" "[ -d ~/app/.git ] || git clone -q git@github.com:$REPO.git ~/app"

echo "==> host: .env (only written when missing)"
if ! ssh -i "$KEY" "wortwerk@$HOST" 'test -f ~/app/.env'; then
  local_env() { grep -E "^$1=" .env | head -1 | cut -d= -f2-; }
  {
    echo "DOMAIN=$DOMAIN"
    echo "APP_URL=https://$DOMAIN"
    echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)"
    echo "BETTER_AUTH_SECRET=$(openssl rand -hex 32)"
    echo "MAIL_DRIVER=smtp"
    echo "SMTP_SERVER=$(local_env SMTP_SERVER)"
    echo "SMTP_EMAIL=$(local_env SMTP_EMAIL)"
    echo "SMTP_PASSWORD=$(local_env SMTP_PASSWORD)"
    echo "MAIL_FROM=$(local_env MAIL_FROM)"
    echo "OPENROUTER_API_KEY=$(local_env OPENROUTER_API_KEY)"
    echo "MT_MODEL=anthropic/claude-haiku-5.5"
    echo "BACKUP_DIR=/home/wortwerk/backups"
    echo "# GITHUB_APP_ID= GITHUB_APP_SLUG= GITHUB_APP_PRIVATE_KEY= GITHUB_WEBHOOK_SECRET="
    echo "# GITHUB_APP_CLIENT_ID= GITHUB_APP_CLIENT_SECRET= BITBUCKET_CLIENT_ID= BITBUCKET_CLIENT_SECRET="
  } | ssh -i "$KEY" "wortwerk@$HOST" 'umask 077 && cat > ~/app/.env && mkdir -p ~/backups'
fi

echo "==> first deploy"
ssh -i "$KEY" "wortwerk@$HOST" '~/app/deploy/deploy.sh'
echo "==> done: https://$DOMAIN"
