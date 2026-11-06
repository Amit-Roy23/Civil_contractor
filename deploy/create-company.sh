#!/usr/bin/env bash
# Create a company and its owner login on this server.
#   ./create-company.sh --code sd --from setup/saurajit-deb.json --owner-password 'a-strong-password'
#   ./create-company.sh --code acme --name "Acme Infra Pvt Ltd" --owner-name "Owner" --owner-username owner \
#       --owner-phone 9800000000 --owner-password 'a-strong-password'
# Add --dry-run to check a setup file without saving.
set -euo pipefail
cd "$(dirname "$0")"
docker compose exec -T api node dist/v2/create-company.js "$@"
