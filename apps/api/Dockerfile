# syntax=docker/dockerfile:1
# API image. Build from the repository root:
#   docker build -f apps/api/Dockerfile -t pet-app-api .
# NODE_IMAGE follows .nvmrc (the deploy workflow passes it), so the image runs the same Node as CI.
ARG NODE_IMAGE=node:22-slim

FROM ${NODE_IMAGE} AS build
WORKDIR /repo
# pnpm version comes from "packageManager" in package.json, as in CI.
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
RUN pnpm install --frozen-lockfile --filter "api..."
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY packages/db packages/db
COPY apps/api apps/api
RUN pnpm -F @pet-app/shared build \
 && pnpm -F @pet-app/db build \
 && pnpm -F api build:server
# Production node_modules only, with the workspace packages copied in (no symlinks into /repo).
RUN pnpm --filter api deploy --prod /out

FROM ${NODE_IMAGE} AS runtime
ARG APP_VERSION=dev
ENV NODE_ENV=production \
    APP_VERSION=${APP_VERSION} \
    HOST=0.0.0.0 \
    PORT=3000
WORKDIR /app
COPY --from=build /out/package.json ./
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /repo/apps/api/dist ./dist
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + process.env.PORT + '/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "dist/index.js"]
