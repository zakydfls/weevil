# Weevil

Bug reporting platform — capture, inspect, and share browser bugs with full context.

## Structure

```
weevil/
├── apps/
│   ├── backend/   NestJS API + worker (Prisma, RabbitMQ, MinIO)
│   ├── web/       Next.js dashboard (React 19, Tailwind v4)
│   └── ext/       Chrome extension MV3 (screen record, console, network, actions)
└── packages/      shared libraries (future: types, ui, etc.)
```

## Prerequisites

- Node.js ≥ 20
- pnpm ≥ 10
- Docker (for Postgres, Redis, RabbitMQ, MinIO in dev)

## Getting started

```bash
# install all deps
pnpm install

# copy env files
cp .env.example apps/backend/.env
cp .env.example apps/web/.env.local   # only the NEXT_PUBLIC_ lines apply

# run database migrations
pnpm prisma:migrate

# start API + worker + web in parallel
pnpm dev:api & pnpm dev:worker & pnpm dev:web
```

## Commands

| Command | Description |
|---|---|
| `pnpm dev:api` | Start NestJS API in watch mode |
| `pnpm dev:worker` | Start background worker in watch mode |
| `pnpm dev:web` | Start Next.js dev server |
| `pnpm build` | Build all apps |
| `pnpm typecheck` | Typecheck all apps |
| `pnpm lint` | Lint all apps |
| `pnpm prisma:migrate` | Run database migrations |
| `pnpm prisma:studio` | Open Prisma Studio |

## Extension

Load unpacked from `apps/ext/dist/` after running `pnpm build:ext`.
