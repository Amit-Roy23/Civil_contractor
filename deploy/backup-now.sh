#!/usr/bin/env bash
# Write a full database backup into deploy/backups now.
set -euo pipefail
cd "$(dirname "$0")"
docker compose exec -T backup sh /db-backup.sh now
ls -lh backups | tail -5
