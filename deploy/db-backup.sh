#!/bin/sh
# Nightly full database dump (pg_dump custom format) into /backups, kept KEEP_DAYS days.
# Run once now:  docker compose exec backup sh /db-backup.sh now
set -eu
KEEP_DAYS="${KEEP_DAYS:-14}"
BACKUP_AT="${BACKUP_AT:-02:30}"

dump() {
  f="/backups/wcm-$(date +%Y%m%d-%H%M%S).dump"
  pg_dump --format=custom --no-owner --file="$f.part" && mv "$f.part" "$f"
  echo "$(date '+%F %T') backup written: $f ($(du -h "$f" | cut -f1))"
  find /backups -name 'wcm-*.dump' -mtime "+$KEEP_DAYS" -print -delete
}

if [ "${1:-}" = "now" ]; then dump; exit 0; fi

echo "Database backups every day at $BACKUP_AT ($(date +%Z)), kept $KEEP_DAYS days"
while true; do
  now=$(date +%s)
  next=$(date -d "$(date +%F) $BACKUP_AT" +%s 2>/dev/null || date -D '%Y-%m-%d %H:%M' -d "$(date +%F) $BACKUP_AT" +%s)
  [ "$next" -le "$now" ] && next=$((next + 86400))
  sleep $((next - now))
  dump || echo "$(date '+%F %T') BACKUP FAILED"
done
