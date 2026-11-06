#!/usr/bin/env bash
# Pull the latest code, back up the database, rebuild and restart with no data loss.
set -euo pipefail
cd "$(dirname "$0")"
echo "▶ Backing up the database first"
docker compose exec -T backup sh /db-backup.sh now
echo "▶ Getting the latest code"
git -C .. pull --ff-only
echo "▶ Rebuilding"
docker compose build
docker compose up -d
docker image prune -f >/dev/null
echo "✅ Updated. Check: docker compose ps"
