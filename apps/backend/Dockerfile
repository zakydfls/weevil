# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS base

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates dumb-init openssl \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable

WORKDIR /app

FROM base AS deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/backend/package.json apps/backend/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/ext/package.json apps/ext/package.json

RUN pnpm install --frozen-lockfile --filter @weevil/backend...

FROM deps AS build

COPY apps/backend apps/backend

RUN DATABASE_URL="postgresql://weevil:weevil@localhost:5432/weevil?schema=public" \
  pnpm --filter @weevil/backend prisma:generate
RUN DATABASE_URL="postgresql://weevil:weevil@localhost:5432/weevil?schema=public" \
  pnpm --filter @weevil/backend build

FROM base AS runtime

ENV NODE_ENV=production

WORKDIR /app

COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=build --chown=node:node /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=build --chown=node:node /app/node_modules ./node_modules

COPY --from=build --chown=node:node /app/apps/backend/package.json ./apps/backend/package.json
COPY --from=build --chown=node:node /app/apps/backend/node_modules ./apps/backend/node_modules
COPY --from=build --chown=node:node /app/apps/backend/prisma ./apps/backend/prisma
COPY --from=build --chown=node:node /app/apps/backend/prisma.config.ts ./apps/backend/prisma.config.ts
COPY --from=build --chown=node:node /app/apps/backend/dist ./apps/backend/dist

WORKDIR /app/apps/backend

USER node

EXPOSE 4000

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/apps/api/apps/api/src/main.js"]
