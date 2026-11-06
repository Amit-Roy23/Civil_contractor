#!/usr/bin/env bash
# One-time set-up of WCM on a fresh Ubuntu / Debian server.
#   sudo ./deploy/install.sh --domain wcm.example.in --email you@example.in
# Before running: point the domain's DNS "A" record to this server's public IP.
set -euo pipefail
cd "$(dirname "$0")"

DOMAIN="" EMAIL="" COMPANY="sd"
while [ $# -gt 0 ]; do
  case "$1" in
    --domain) DOMAIN="$2"; shift 2 ;;
    --email) EMAIL="$2"; shift 2 ;;
    --company) COMPANY="$2"; shift 2 ;;
    *) echo "Unknown option $1"; exit 1 ;;
  esac
done

say() { printf '\n\033[1;33m▶ %s\033[0m\n' "$*"; }

if ! command -v docker >/dev/null 2>&1; then
  say "Installing Docker"
  curl -fsSL https://get.docker.com | sh
fi
docker compose version >/dev/null

if [ ! -f .env ]; then
  [ -n "$DOMAIN" ] || { echo "Give --domain (e.g. --domain wcm.example.in)"; exit 1; }
  say "Writing deploy/.env with new secrets"
  cp .env.example .env
  gen() { openssl rand -hex 32; }
  sed -i "s|^DOMAIN=.*|DOMAIN=$DOMAIN|; s|^ACME_EMAIL=.*|ACME_EMAIL=$EMAIL|; s|^DEFAULT_COMPANY=.*|DEFAULT_COMPANY=$COMPANY|" .env
  sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(gen)|; s|^JWT_SECRET=.*|JWT_SECRET=$(gen)|; s|^JWT_REFRESH_SECRET=.*|JWT_REFRESH_SECRET=$(gen)|" .env
  chmod 600 .env
else
  say "Keeping the existing deploy/.env"
fi

DOMAIN_NOW=$(grep '^DOMAIN=' .env | cut -d= -f2- | cut -d, -f1 | tr -d ' ')
IP=$(curl -fsS https://api.ipify.org || true)
DNS=$(getent hosts "$DOMAIN_NOW" | awk '{print $1}' | head -1 || true)
if [ -n "$IP" ] && [ "$DNS" != "$IP" ]; then
  echo "⚠  $DOMAIN_NOW points to '${DNS:-nothing}', this server is $IP."
  echo "   HTTPS will start working once the DNS A record points here."
fi

if command -v ufw >/dev/null 2>&1; then
  say "Opening ports 22, 80 and 443 in the firewall"
  ufw allow 22/tcp >/dev/null; ufw allow 80/tcp >/dev/null; ufw allow 443 >/dev/null
  ufw --force enable >/dev/null || true
fi

say "Building and starting (first build takes a few minutes)"
docker compose up -d --build

say "Waiting for the API"
for i in $(seq 1 60); do
  if docker compose exec -T api wget -qO- http://127.0.0.1:3000/health >/dev/null 2>&1; then ok=1; break; fi
  sleep 3
done
[ "${ok:-}" = 1 ] || { docker compose logs --tail 50 api; echo "API did not start"; exit 1; }

cat <<MSG

✅ WCM is running at https://$DOMAIN_NOW

Next: create the company and its owner login (once):
  ./create-company.sh --code $COMPANY --from setup/saurajit-deb.json --owner-password 'a-strong-password'

Backups:  nightly into deploy/backups  ·  ./backup-now.sh for one now
Update:   ./update.sh
Logs:     docker compose logs -f api
MSG
