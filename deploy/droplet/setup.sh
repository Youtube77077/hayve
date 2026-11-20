#!/usr/bin/env bash
# Sets up Hayve on a fresh Ubuntu droplet (22.04 or 24.04) and keeps it running.
#
#   Run as root in the droplet console:
#     curl -fsSL https://raw.githubusercontent.com/Youtube77077/hayve/main/deploy/droplet/setup.sh | bash
#
#   Later, with a domain pointed at the droplet (an A record to its IP):
#     bash /opt/hayve/deploy/droplet/setup.sh --domain hayve.example.com
#
# Safe to run again: it updates the code and restarts what changed. Secrets are generated once
# and kept in /opt/hayve/deploy/droplet/.env (never committed).
set -euo pipefail

REPO="https://github.com/Youtube77077/hayve.git"
BRANCH="main"
DIR="/opt/hayve"
DOMAIN=""
while [ $# -gt 0 ]; do
  case "$1" in
    --domain) DOMAIN="${2:-}"; shift 2 ;;
    --branch) BRANCH="${2:-main}"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

if [ "$(id -u)" -ne 0 ]; then echo "Run this as root (or with sudo)."; exit 1; fi
export DEBIAN_FRONTEND=noninteractive
say() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }

say "Updating the system"
apt-get update -qq
apt-get install -y -qq ca-certificates curl git ufw unattended-upgrades >/dev/null
# Security updates install automatically; the server reboots at 04:00 only when an update needs it.
cat >/etc/apt/apt.conf.d/52hayve-upgrades <<'EOF'
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-Time "04:00";
EOF
dpkg-reconfigure -f noninteractive unattended-upgrades >/dev/null

if ! swapon --show | grep -q .; then
  say "Adding 4 GB swap (building the website needs more memory than small droplets have)"
  fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >>/etc/fstab
fi

if ! command -v docker >/dev/null; then
  say "Installing Docker"
  curl -fsSL https://get.docker.com | sh >/dev/null
fi
systemctl enable --now docker >/dev/null

say "Firewall: allow SSH, HTTP and HTTPS only"
ufw allow OpenSSH >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443 >/dev/null
ufw --force enable >/dev/null

say "Getting the Hayve code ($BRANCH)"
if [ -d "$DIR/.git" ]; then
  git -C "$DIR" fetch -q origin "$BRANCH"
  git -C "$DIR" checkout -q "$BRANCH"
  git -C "$DIR" reset -q --hard "origin/$BRANCH"
else
  git clone -q --branch "$BRANCH" "$REPO" "$DIR"
fi

ENV="$DIR/deploy/droplet/.env"
IP=$(curl -fsS https://api.ipify.org || hostname -I | awk '{print $1}')
if [ ! -f "$ENV" ]; then
  say "Creating secrets in $ENV"
  umask 077
  cat >"$ENV" <<EOF
# Hayve server settings. Keep this file private. Edit, then run setup.sh again.
POSTGRES_PASSWORD=$(openssl rand -hex 24)
JWT_SECRET=$(openssl rand -base64 48 | tr -d '\n')
SITE_ADDRESS=:80
PUBLIC_URL=http://$IP
APP_ORIGINS=http://$IP
# Optional, add when you have them:
EXPO_PUBLIC_MAPBOX_TOKEN=
EXPO_PUBLIC_MAPBOX_STYLE_URL=
POSTMARK_TOKEN=
EMAIL_FROM=Hayve <no-reply@hayve.app>
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
SPACES_ENDPOINT=
SPACES_BUCKET=
SPACES_KEY=
SPACES_SECRET=
SPACES_CDN_URL=
EOF
fi
set_env() { if grep -q "^$1=" "$ENV"; then sed -i "s|^$1=.*|$1=$2|" "$ENV"; else echo "$1=$2" >>"$ENV"; fi; }
if [ -n "$DOMAIN" ]; then
  set_env SITE_ADDRESS "$DOMAIN"
  set_env PUBLIC_URL "https://$DOMAIN"
  set_env APP_ORIGINS "https://$DOMAIN"
fi

say "Building and starting Hayve (the first build takes 5–15 minutes)"
cd "$DIR/deploy/droplet"
docker compose --env-file .env up -d --build --remove-orphans
docker image prune -f >/dev/null

say "Nightly database backup at 03:30 (last 14 kept in /opt/hayve-backups)"
mkdir -p /opt/hayve-backups && chmod 700 /opt/hayve-backups
cat >/etc/cron.d/hayve-backup <<'EOF'
30 3 * * * root cd /opt/hayve/deploy/droplet && docker compose exec -T db pg_dump -U hayve -Fc hayve > /opt/hayve-backups/hayve-$(date +\%F).dump && find /opt/hayve-backups -name '*.dump' -mtime +14 -delete
EOF

say "Waiting for the site to answer"
for _ in $(seq 1 60); do
  if curl -fsS -o /dev/null "http://localhost/" && curl -fsS -o /dev/null "http://localhost/api/health"; then ok=1; break; fi
  sleep 5
done
docker compose ps
if [ "${ok:-}" = 1 ]; then
  URL=$(grep '^PUBLIC_URL=' .env | cut -d= -f2-)
  say "Hayve is live: $URL   (API: $URL/api/health)"
  echo "Update to the latest code any time:  bash $DIR/deploy/droplet/setup.sh"
else
  echo "The site didn't answer yet. See what's happening with:  cd $DIR/deploy/droplet && docker compose logs --tail 80"
fi
