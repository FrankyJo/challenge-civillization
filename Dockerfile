# syntax=docker/dockerfile:1
# One image for the Node processes (api, simulation, worker, migrate); the
# command selects the process. The web app is static output (apps/web/dist).
FROM node:22.19-alpine AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
# Pin pnpm to package.json "packageManager" so builds never float to a new major.
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /repo

FROM base AS build
# Dependency layer: only lockfile/workspace metadata, so source edits reuse it.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm fetch --frozen-lockfile
COPY . .
RUN pnpm install --frozen-lockfile --offline
RUN pnpm exec turbo run build --filter=@civ/api --filter=@civ/simulation --filter=@civ/worker --filter=@civ/db
# Drop dev dependencies (compilers, linters, test tools) from the runtime tree.
RUN pnpm install --frozen-lockfile --prod

FROM node:22.19-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /repo
COPY --from=build --chown=node:node /repo /repo
USER node
CMD ["node", "apps/api/dist/main.js"]
