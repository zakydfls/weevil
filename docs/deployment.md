# Weevil Production Deployment

This repo deploys as two separate production surfaces:

- `apps/web` -> Vercel.
- `apps/backend` -> Docker on a homeserver through GitHub Actions.

## Backend CI/CD

The backend workflow is in `.github/workflows/backend-deploy.yml`.

On push to `main` when backend/deploy files change, it:

1. Typechecks `@weevil/backend`.
2. Builds `apps/backend/Dockerfile`.
3. Pushes the image to GitHub Container Registry as:
   - `ghcr.io/<owner>/<repo>/backend:sha-<commit>`
   - `ghcr.io/<owner>/<repo>/backend:main`
4. SSHes into the homeserver.
5. Uploads `deploy/backend/compose.prod.yml` and `deploy/backend/deploy.sh`.
6. Pulls the exact commit image.
7. Runs Prisma migrations.
8. Optionally runs the production seeder when `RUN_PROD_SEED=true`.
9. Restarts `weevil-api` and `weevil-worker`.

### GitHub repository secrets

Create these under GitHub repository settings -> Secrets and variables -> Actions:

```text
SSH_HOST=
SSH_USER=
SSH_PRIVATE_KEY=
GH_TOKEN=
CF_ACCESS_CLIENT_ID=
CF_ACCESS_CLIENT_SECRET=
```

`GH_TOKEN` is used by the homeserver to pull the private GHCR image. Use a
classic PAT or fine-grained token that can read packages for this repository.

`CF_ACCESS_CLIENT_ID` and `CF_ACCESS_CLIENT_SECRET` are optional only if the SSH
host is directly reachable. When the homeserver SSH endpoint is protected by
Cloudflare Access, set both values and make sure the Access policy allows
Service Auth for that service token.

### Optional GitHub variables

Create these under GitHub repository settings -> Secrets and variables ->
Actions -> Variables if the defaults do not match your server:

```text
BACKEND_DEPLOY_PATH=weevil
BACKEND_API_BIND=127.0.0.1
BACKEND_API_PORT=4000
RUN_PROD_SEED=
```

`BACKEND_DEPLOY_PATH` may be a path relative to the SSH user's home directory
(`weevil`) or an absolute path (`/opt/weevil`). Do not use `~/weevil` here; the
workflow intentionally rejects `~` to avoid shell expansion ambiguity.

Keep `BACKEND_API_BIND=127.0.0.1` when a reverse proxy or Cloudflare Tunnel on
the same server forwards traffic to the API. Use `0.0.0.0` only when the Docker
port should be reachable from the network.

`RUN_PROD_SEED` may be set here to override the server env. When this GitHub
variable is empty or unset, the deploy script reads `RUN_PROD_SEED` from
`~/weevil/.env`.

### First-time homeserver setup

The deploy user needs:

- Docker Engine with the `docker compose` plugin.
- Permission to run Docker.
- SSH access using the public key that matches `SSH_PRIVATE_KEY`.
- A production env file at `~/weevil/.env` or your custom `BACKEND_DEPLOY_PATH`.

Create the env file from:

```bash
deploy/backend/.env.production.example
```

Important production values:

```text
NODE_ENV=production
DATABASE_URL=...
REDIS_URL=...
RABBITMQ_URL=...
MINIO_ENDPOINT=...
WEB_ORIGIN=https://your-vercel-domain.vercel.app,https://your-custom-domain.com
COOKIE_SAMESITE=none
COOKIE_SECURE=true
RUN_PROD_SEED=true
SEED_ADMIN_EMAIL=...
SEED_ADMIN_PASSWORD=...
```

If Postgres, Redis, RabbitMQ, or MinIO run on the host instead of in a Docker
network, point the backend containers to `host.docker.internal`.

`RUN_PROD_SEED=true` runs `pnpm prisma:seed:prod` during deploy after
migrations. Use it for the first production bootstrap, then set it back to
`false`. The prod seeder is idempotent for workspace/project/member creation,
but it intentionally rotates the admin password to `SEED_ADMIN_PASSWORD`.

### Supabase database URLs

If production uses Supabase and migration fails with:

```text
P1001: Can't reach database server at db.<project-ref>.supabase.co:5432
```

your server/container probably cannot reach Supabase's direct database endpoint.
Supabase direct database URLs are IPv6 by default unless the project has the
IPv4 add-on. For IPv4-only hosts, use the Supabase **Session Pooler** URL from
Dashboard -> Connect:

```text
DATABASE_URL=postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require&connect_timeout=30
```

Prefer session mode on port `5432` for this persistent backend. Transaction mode
on port `6543` is mainly for serverless/edge traffic and may require additional
Prisma pooler options.

### Manual deploy

You can run the workflow from GitHub Actions with `workflow_dispatch`.

On the server, useful checks:

```bash
cd ~/weevil
docker compose --env-file .deploy.env -f compose.prod.yml ps
docker logs -f weevil-api
docker logs -f weevil-worker
```

## Frontend on Vercel

Create one Vercel project for the web app and choose:

```text
Root Directory: apps/web
Framework Preset: Next.js
Install Command: Auto
Build Command: pnpm build
Output Directory: Auto / Next.js default
```

Set this Vercel environment variable:

```text
NEXT_PUBLIC_API_BASE_URL=https://your-api-domain.com/v1
```

Because this is a pnpm monorepo with `pnpm-workspace.yaml` and a root lockfile,
Vercel can deploy `apps/web` directly as a monorepo project. The important
manual setting is the root directory.

Remember to mirror the Vercel production/preview domains in backend `WEB_ORIGIN`
so CORS allows the dashboard to call the homeserver API.
