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
free_port() { local p=$1; while ss -ltnH "( sport = :$p )" | grep -q .; do p=$((p + 1)); done; echo "$p"; }
env_get() { grep "^$1=" "$DIR/.env" | cut -d= -f2- || true; }
ask() { local prompt=$1 default=${2:-} answer; read -r -p "$prompt${default:+ [$default]}: " answer </dev/tty; echo "${answer:-$default}"; }

[ "$(id -u)" -eq 0 ] || { echo "Run as root (sudo)."; exit 1; }
DIR=/opt/pet-app

# Adds (or refreshes) our site block in another project's Caddyfile, between pet-app markers, so the other
# sites stay as they are. A copy is kept next to it; if Caddy rejects the new file, the copy goes back.
connect_shared_caddy() {
  local pid=$CADDY_PID cfg cid="" file inner host_file domain api_port cms_port backup
  domain=$(env_get API_DOMAIN)
  api_port=$(env_get API_HOST_PORT); api_port=${api_port:-3100}
  cms_port=$(env_get DIRECTUS_HOST_PORT); cms_port=${cms_port:-8055}
  # The config path Caddy was started with (`caddy run --config …`); the packaged service uses this default.
  cfg=$(tr '\0' '\n' <"/proc/$pid/cmdline" |
    awk 'prev == "--config" { print; exit } /^--config=/ { sub(/^--config=/, ""); print; exit } { prev = $0 }')
  cfg=${cfg:-/etc/caddy/Caddyfile}
  case "$cfg" in *.json) echo "That Caddy runs from JSON ($cfg), not a Caddyfile. Stop here and tell Claude."; exit 1 ;; esac
  # In a container? Then edit the file on the host that is mounted into it, and run caddy inside it.
  cid=$(grep -oE '[0-9a-f]{64}' "/proc/$pid/cgroup" | head -n1 || true)
  if [ -n "$cid" ]; then
    inner=$cfg
    host_file=$(docker inspect "$cid" --format '{{range .Mounts}}{{println .Destination .Source}}{{end}}' |
      awk -v f="$inner" -v d="$(dirname "$inner")" '$1 == f { print $2; exit } $1 == d { print $2 "/" substr(f, length(d) + 2); exit }')
    if [ -z "$host_file" ]; then
      echo "Caddy runs in container ${cid:0:12} and $inner is not mounted from the host. Stop here and tell Claude."
      exit 1
    fi
    file=$host_file
  else
    file=$cfg
  fi
  [ -f "$file" ] || { echo "Caddyfile not found at $file. Stop here and tell Claude."; exit 1; }
  echo "Caddyfile: $file${cid:+ (container ${cid:0:12})}"

  backup="$file.before-pet-app.$(date +%Y%m%d%H%M%S)"
  cp -p "$file" "$backup"
  sed -i '/^# >>> pet-app/,/^# <<< pet-app/d' "$file"
  cat >>"$file" <<CADDY
# >>> pet-app (API, added by pet-app deploy/setup-server.sh; the rest of this file is not ours)
$domain {
	encode zstd gzip
	header {
		Strict-Transport-Security "max-age=31536000"
		X-Content-Type-Options nosniff
		-Server
	}
	handle_path /cms/* {
		reverse_proxy 127.0.0.1:$cms_port
	}
	handle {
		request_body {
			max_size 1MB
		}
		reverse_proxy 127.0.0.1:$api_port
	}
}
# <<< pet-app
CADDY

  # Apply it the way that Caddy is run, so its own environment (e.g. {$VARS} from a systemd EnvironmentFile) is used.
  # A rejected config leaves the running one as it was; then the file goes back too and the reason is shown.
  local unit out ok=1
  unit=$(ps -o unit= -p "$pid" 2>/dev/null | tr -d ' ' || true)
  if [ -n "$cid" ]; then
    out=$(docker exec "$cid" caddy reload --config "$inner" --adapter caddyfile 2>&1) || ok=0
  elif [ "${unit%.service}" != "$unit" ] && [ -n "$unit" ]; then
    echo "Service: $unit"
    out=$(systemctl reload "$unit" 2>&1) || { ok=0; out="$out
$(journalctl -u "$unit" -n 20 --no-pager 2>&1)"; }
  else
    out=$(caddy reload --config "$file" --adapter caddyfile 2>&1) || ok=0
  fi
  if [ "$ok" = 0 ]; then
    cp -p "$backup" "$file"
    echo "$out" | tail -n 20
    echo
    echo "Caddy did not accept the new site (reason above); its Caddyfile is back as it was. Send this to Claude."
    exit 1
  fi
  echo "Added https://$domain to that Caddy (copy of the old file: $backup). Its other sites are unchanged."
}

say "1/7 Ports 80 and 443"
# Free → our own Caddy. Taken by another project's Caddy → we add a site block to it (step 6) and leave its
# other sites alone. Taken by anything else → stop.
MODE=own
CADDY_PID=
if ss -ltnH '( sport = :80 or sport = :443 )' | grep -q .; then
  ss -ltnp '( sport = :80 or sport = :443 )'
  if docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^pet-app-caddy'; then
    echo "It is ours."
  else
    CADDY_PID=$(ss -ltnpH '( sport = :443 )' | grep -o '"caddy",pid=[0-9]*' | head -n1 | cut -d= -f2 || true)
    if [ -z "$CADDY_PID" ]; then
      echo "Ports 80/443 are taken by something other than Caddy (above). Stop here and tell Claude what it is."
      exit 1
    fi
    MODE=shared
    echo "Another project's Caddy (pid $CADDY_PID): the API will be added to it as one more site."
  fi
fi
echo "OK"

say "2/7 Docker"
if ! command -v docker >/dev/null || ! docker compose version >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi
docker compose version

say "3/7 User 'deploy' and $DIR"
id deploy >/dev/null 2>&1 || adduser --disabled-password --gecos "" deploy
usermod -aG docker deploy
install -d -o deploy -g deploy -m 750 "$DIR"
install -d -o deploy -g deploy -m 700 /home/deploy/.ssh
echo "OK"

say "4/7 Key for GitHub Actions"
KEY=/root/pet-app-deploy-key
if [ ! -f "$KEY" ]; then
  ssh-keygen -q -t ed25519 -N "" -C "pet-app deploy (GitHub Actions)" -f "$KEY"
fi
touch /home/deploy/.ssh/authorized_keys
grep -qxF "$(cat "$KEY.pub")" /home/deploy/.ssh/authorized_keys || cat "$KEY.pub" >> /home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys && chmod 600 /home/deploy/.ssh/authorized_keys
echo "OK"

say "5/7 Settings in $DIR/.env"
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
  # Loopback ports for the API and the admin panel: the first free ones, so they never clash with other projects.
  PROXY="API_HOST_PORT=$(free_port 3100)
DIRECTUS_HOST_PORT=$(free_port 8055)"
  [ "$MODE" = own ] && PROXY="$PROXY
COMPOSE_PROFILES=caddy"
  umask 077
  cat > "$DIR/.env" <<ENV
API_DOMAIN=$DOMAIN
$PROXY
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

say "6/7 Web server"
if [ "$MODE" = own ]; then
  echo "Our own Caddy (starts with the first deploy)."
else
  connect_shared_caddy
fi

say "7/7 Paste these into GitHub: github.com/ol-voronin/pet-app → Settings → Secrets and variables → Actions → New repository secret"
echo
echo "SSH_HOST:"
echo "$IP"
echo
echo "SSH_KEY (everything from BEGIN to END, both lines included):"
cat "$KEY"
echo
echo "Then: Actions → Deploy API → Run workflow (branch main). The API will answer at https://$(env_get API_DOMAIN)/health"
echo "If Hetzner's firewall (Robot → Firewall) is on, allow incoming TCP 80, 443 and UDP 443 there too."
