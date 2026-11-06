#!/usr/bin/env bash
# Restore the WHOLE database from a backup file. Everything entered after that backup is lost.
#   ./restore-db.sh backups/wcm-20261106-023000.dump
set -euo pipefail
cd "$(dirname "$0")"
FILE="${1:?give the backup file, e.g. backups/wcm-20261106-023000.dump}"
[ -f "$FILE" ] || { echo "No such file: $FILE"; exit 1; }
read -r -p "This replaces ALL data with $FILE. Type RESTORE to continue: " ok
[ "$ok" = "RESTORE" ] || { echo "Cancelled"; exit 1; }
echo "▶ Safety copy of the current data first"
docker compose exec -T backup sh /db-backup.sh now
docker compose stop api
docker compose exec -T backup pg_restore --clean --if-exists --no-owner --dbname=wcm "/backups/$(basename "$FILE")"
docker compose start api
echo "✅ Restored from $FILE"
