#!/bin/sh
# Starts Caddy. The certificate e-mail is optional: leave ACME_EMAIL empty and the line is dropped.
set -eu
cp /etc/caddy/Caddyfile /tmp/Caddyfile
[ -n "${ACME_EMAIL:-}" ] || sed -i '/^\s*email /d' /tmp/Caddyfile
# for a trial on this machine (DOMAIN=localhost) Caddy uses its own local certificate
exec caddy run --config /tmp/Caddyfile --adapter caddyfile
