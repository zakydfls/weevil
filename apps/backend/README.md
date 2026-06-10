# Weevil Backend

NestJS monorepo for the Weevil bug recording platform.

## Apps

- `api`: HTTP API for dashboard and browser extension clients.
- `worker`: background processor for uploaded artifacts.

## Core Flow

1. Create a bug report draft.
2. Create an artifact upload and receive a MinIO presigned PUT URL.
3. Upload the artifact directly to MinIO.
4. Mark the upload complete.
5. API publishes a RabbitMQ event.
6. Worker processes the uploaded artifact and updates report state.

## Setup

```bash
pnpm install
cp .env.example .env
pnpm prisma:generate
pnpm prisma:migrate
pnpm start:api:dev
pnpm start:worker:dev
```
