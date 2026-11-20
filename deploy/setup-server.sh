#!/usr/bin/env bash
# One-time setup of the API server (ADR-0009). Run on the server as root:
#
#   curl -fsSL https://raw.githubusercontent.com/ol-voronin/pet-app/main/deploy/setup-server.sh | sudo bash
#
# It installs Docker if missing, creates the `deploy` user and /opt/pet-app, writes /opt/pet-app/.env
# (asks for the database address), makes the SSH key GitHub Actions will deploy with, and prints the two
# values to paste into GitHub → Settings → Secrets → Actions: SSH_HOST and SSH_KEY.
# Safe to run again: what exists is kept.
set -euo pipefail

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
ask() { local prompt=$1 default=${2:-} answer; read -r -p "$prompt${default:+ [$default]}: " answer </dev/tty; echo "${answer:-$default}"; }

[ "$(id -u)" -eq 0 ] || { echo "Run as root (sudo)."; exit 1; }
DIR=/opt/pet-app

say "1/6 Ports 80 and 443"
if ss -ltnH '( sport = :80 or sport = :443 )' | grep -q .; then
  ss -ltnp '( sport = :80 or sport = :443 )'
  if ! docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^pet-app-caddy'; then
    echo "Ports 80/443 are taken by something else (above). Caddy needs them. Stop here and tell Claude what it is."
    exit 1
  fi
fi
echo "OK"

say "2/6 Docker"
if ! command -v docker >/dev/null || ! docker compose version >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi
docker compose version

say "3/6 User 'deploy' and $DIR"
id deploy >/dev/null 2>&1 || adduser --disabled-password --gecos "" deploy
usermod -aG docker deploy
install -d -o deploy -g deploy -m 750 "$DIR"
install -d -o deploy -g deploy -m 700 /home/deploy/.ssh
echo "OK"

say "4/6 Key for GitHub Actions"
KEY=/root/pet-app-deploy-key
if [ ! -f "$KEY" ]; then
  ssh-keygen -q -t ed25519 -N "" -C "pet-app deploy (GitHub Actions)" -f "$KEY"
fi
touch /home/deploy/.ssh/authorized_keys
grep -qxF "$(cat "$KEY.pub")" /home/deploy/.ssh/authorized_keys || cat "$KEY.pub" >> /home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys && chmod 600 /home/deploy/.ssh/authorized_keys
echo "OK"

say "5/6 Settings in $DIR/.env"
# The address the server goes out from (Hetzner puts the public IP on the main interface); no outside service asked.
IP=$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for (i = 1; i < NF; i++) if ($i == "src") print $(i + 1)}' || true)
[ -n "$IP" ] || IP=$(hostname -I | awk '{print $1}')
if [ -f "$DIR/.env" ]; then
  echo "$DIR/.env exists — kept as is."
else
  DOMAIN=$(ask "Address for the API (your domain pointed at $IP, or the free one)" "${IP//./-}.sslip.io")
  echo "Database: Neon Console → project pet-app → branch dev → Connect → pooled connection string."
  DB=$(ask "DATABASE_URL")
  [ -n "$DB" ] || { echo "DATABASE_URL is required."; exit 1; }
  umask 077
  cat > "$DIR/.env" <<ENV
API_DOMAIN=$DOMAIN
APP_ENV=staging
OTP_FIXED_CODE=000000
DATABASE_URL=$DB
JWT_SECRET=$(openssl rand -hex 32)
SENTRY_DSN=
ENV
  chown deploy:deploy "$DIR/.env"
fi
if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then
  ufw allow 80/tcp >/dev/null && ufw allow 443/tcp >/dev/null && ufw allow 443/udp >/dev/null && echo "ufw: 80, 443 opened"
fi
echo "OK"

say "6/6 Paste these into GitHub: github.com/ol-voronin/pet-app → Settings → Secrets and variables → Actions → New repository secret"
echo
echo "SSH_HOST:"
echo "$IP"
echo
echo "SSH_KEY (everything from BEGIN to END, both lines included):"
cat "$KEY"
echo
echo "Then: Actions → Deploy API → Run workflow (branch main). The API will answer at https://$(grep '^API_DOMAIN=' "$DIR/.env" | cut -d= -f2)/health"
echo "If Hetzner's firewall (Robot → Firewall) is on, allow incoming TCP 80, 443 and UDP 443 there too."
