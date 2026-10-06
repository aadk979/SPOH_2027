# syntax=docker/dockerfile:1.7
#
# The one image staging and production run (ADR-008 §1, P08.4): the API, the
# client as a static export the API serves, and the migrate entrypoint. ARM64
# on Fargate; CI builds it on GitHub's ARM runners, so nothing is emulated.

FROM node:24-bookworm-slim AS manifests
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/access-policies/package.json packages/access-policies/
COPY server/package.json server/
COPY client/package.json client/
COPY infra/cdk/package.json infra/cdk/

FROM manifests AS build
ENV NEXT_TELEMETRY_DISABLED=1 CI=1
RUN npm ci --no-audit --no-fund
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY server server
COPY client client
RUN npm run build --workspace packages/shared \
 && DATABASE_URL=postgresql://build:build@localhost:5432/build npm run build --workspace server  && npm run build:seed --workspace server \
 && SPOH_STATIC_EXPORT=1 npm run build --workspace client

# Runtime dependencies of the server and the shared package, the Prisma CLI
# (which the migrate task runs) among them. No client or dev dependencies.
FROM manifests AS deps
RUN npm ci --omit=dev --no-audit --no-fund --workspace server --workspace packages/shared

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=4000 CLIENT_DIR=/app/client/out

COPY --from=deps --chown=node:node /app/node_modules node_modules
COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/packages/shared/package.json packages/shared/
COPY --from=build --chown=node:node /app/packages/shared/dist packages/shared/dist
COPY --from=build --chown=node:node /app/server/package.json /app/server/prisma.config.ts server/
COPY --from=build --chown=node:node /app/server/dist server/dist
COPY --from=build --chown=node:node /app/server/prisma server/prisma
COPY --from=build --chown=node:node /app/server/scripts server/scripts
COPY --from=build --chown=node:node /app/client/out client/out
COPY --chown=node:node infra/docker/entrypoint.sh /app/entrypoint.sh
# The P09 totals check, for the entrypoint's one-off `totals` task.
COPY --chown=node:node remediation/reports/P09/totals.mjs server/scripts/event-one-totals.mjs
# RDS certificates are not in Node's trust store, and pg reads sslmode=require
# as full verification: trust AWS's published RDS bundle (vendored, refreshed
# when AWS rotates it).
COPY infra/docker/rds-global-bundle.pem /app/certs/rds-global-bundle.pem
ENV NODE_EXTRA_CA_CERTS=/app/certs/rds-global-bundle.pem

USER node
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4000/readyz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
ENTRYPOINT ["/bin/sh", "/app/entrypoint.sh"]
CMD ["serve"]
