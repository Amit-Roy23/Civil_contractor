# syntax=docker/dockerfile:1.7
# One Dockerfile, two images:
#   docker build --target api .   → the API (NestJS + business rules), port 3000
#   docker build --target web .   → the web app served by Caddy with HTTPS for your domain

ARG NODE_IMAGE=node:22-alpine

ARG PNPM_VERSION=11.23.0

# ---------- dependencies (cached while the lockfile is unchanged) ----------
# Behind a TLS-inspecting company proxy, pass its CA:  --secret id=extra_ca,src=/path/ca.crt
FROM ${NODE_IMAGE} AS deps
ARG PNPM_VERSION
WORKDIR /repo
ENV CI=true
RUN --mount=type=secret,id=extra_ca,required=false \
    if [ -f /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca npm_config_cafile=/run/secrets/extra_ca; fi; \
    npm install -g pnpm@${PNPM_VERSION} --no-fund --no-audit
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/domain/package.json packages/domain/
COPY packages/shared/package.json packages/shared/
COPY packages/ui/package.json packages/ui/
COPY packages/config/package.json packages/config/
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store --mount=type=secret,id=extra_ca,required=false \
    if [ -f /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca npm_config_cafile=/run/secrets/extra_ca; fi; \
    pnpm install --frozen-lockfile

# ---------- build everything ----------
FROM deps AS build
COPY . .
# the web app talks to the API on the same address (/api), so no CORS and no extra domain
ENV VITE_DATA_MODE=api VITE_API_URL=/api
RUN pnpm turbo run build --filter=@civil/api --filter=@civil/web

# ---------- API runtime: production dependencies only ----------
FROM deps AS api-deps
WORKDIR /prod
COPY --from=deps /repo/package.json /repo/pnpm-lock.yaml /repo/pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY packages/domain/package.json packages/domain/
COPY packages/shared/package.json packages/shared/
COPY packages/ui/package.json packages/ui/
COPY packages/config/package.json packages/config/
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store --mount=type=secret,id=extra_ca,required=false \
    if [ -f /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca npm_config_cafile=/run/secrets/extra_ca; fi; \
    pnpm install --frozen-lockfile --prod --filter "@civil/api..."

FROM ${NODE_IMAGE} AS api
WORKDIR /app
ENV NODE_ENV=production PORT=3000 BUSINESS_TZ=Asia/Kolkata
COPY --from=api-deps --chown=node:node /prod /app
COPY --from=build --chown=node:node /repo/apps/api/dist /app/apps/api/dist
COPY --from=build --chown=node:node /repo/apps/api/setup /app/apps/api/setup
COPY --from=build --chown=node:node /repo/packages/domain/dist /app/packages/domain/dist
COPY --from=build --chown=node:node /repo/packages/shared/dist /app/packages/shared/dist
USER node
WORKDIR /app/apps/api
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health >/dev/null || exit 1
# run with an init process (compose: init: true) so stop signals reach node and it shuts down cleanly
CMD ["node", "dist/main.js"]

# ---------- web: static files behind Caddy (automatic HTTPS) ----------
FROM caddy:2-alpine AS web
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY deploy/caddy-start.sh /usr/local/bin/caddy-start
COPY --from=build /repo/apps/web/dist /srv
CMD ["/bin/sh", "/usr/local/bin/caddy-start"]
