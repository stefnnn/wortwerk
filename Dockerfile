# syntax=docker/dockerfile:1
FROM node:24-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
RUN corepack enable
WORKDIR /app

FROM base AS build
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
# The build prerenders public pages, which loads server modules that validate these.
RUN DATABASE_URL=postgres://build@localhost/build BETTER_AUTH_SECRET=build-time-placeholder-secret \
    pnpm --filter @wortwerk/web build
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    rm -rf node_modules apps/*/node_modules packages/*/node_modules \
    && pnpm install --frozen-lockfile --prod

FROM base AS runtime
ENV NODE_ENV=production PORT=3000 STORAGE_DIR=/data/storage
RUN mkdir -p /data/storage && chown node:node /data/storage
COPY --from=build --chown=node:node /app /app
USER node
EXPOSE 3000
CMD ["node", "apps/web/.output/server/index.mjs"]
