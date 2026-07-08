# Weevil Production Deployment

This repo deploys as two separate production surfaces:

- `apps/web` -> Vercel.
- `apps/backend` -> Docker on a VPS through GitHub Actions, exposed by Nginx.

## Backend CI/CD

The backend workflow is in `.github/workflows/backend-deploy.yml`.

On push to `main` when backend/deploy files change, it:

1. Typechecks `@weevil/backend`.
2. Builds `apps/backend/Dockerfile`.
3. Pushes the image to GitHub Container Registry as:
   - `ghcr.io/<owner>/<repo>/backend:sha-<commit>`
   - `ghcr.io/<owner>/<repo>/backend:main`
4. SSHes into the VPS.
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
```

Optional only when SSH is protected by Cloudflare Access:

```text
CF_ACCESS_CLIENT_ID=
CF_ACCESS_CLIENT_SECRET=
```

`GH_TOKEN` is used by the VPS to pull the private GHCR image. Use a
classic PAT or fine-grained token that can read packages for this repository.

`CF_ACCESS_CLIENT_ID` and `CF_ACCESS_CLIENT_SECRET` are optional legacy support
for Cloudflare Access-protected SSH. For a normal VPS with direct SSH, leave
them unset. Even if these secrets exist, the workflow ignores them unless
`BACKEND_SSH_USE_CF_ACCESS=true`.

### Optional GitHub variables

Create these under GitHub repository settings -> Secrets and variables ->
Actions -> Variables if the defaults do not match your server:

```text
BACKEND_DEPLOY_PATH=weevil
BACKEND_API_BIND=127.0.0.1
BACKEND_API_PORT=4000
BACKEND_SSH_PORT=22
BACKEND_SSH_USE_CF_ACCESS=false
RUN_PROD_SEED=
```

`BACKEND_DEPLOY_PATH` may be a path relative to the SSH user's home directory
(`weevil`) or an absolute path (`/opt/weevil`). Do not use `~/weevil` here; the
workflow intentionally rejects `~` to avoid shell expansion ambiguity.

For VPS + Nginx, keep `BACKEND_API_BIND=127.0.0.1`. The API container is then
reachable only from the VPS itself, and Nginx exposes HTTPS publicly. Use
`0.0.0.0` only when the Docker port should be reachable directly from the
network.

Set `BACKEND_SSH_PORT` if the VPS SSH daemon uses a non-standard port.

Keep `BACKEND_SSH_USE_CF_ACCESS=false` for normal VPS direct SSH. Set it to
`true` only when SSH is intentionally protected by Cloudflare Access.

`RUN_PROD_SEED` may be set here to override the server env. When this GitHub
variable is empty or unset, the deploy script reads `RUN_PROD_SEED` from the
VPS `.env` inside `BACKEND_DEPLOY_PATH`.

### First-time VPS setup

The deploy user needs:

- Docker Engine with the `docker compose` plugin.
- Permission to run Docker.
- SSH access using the public key that matches `SSH_PRIVATE_KEY`.
- Nginx and HTTPS for the public API domain.
- A production env file at `~/weevil/.env` or your custom `BACKEND_DEPLOY_PATH`
  such as `/opt/weevil/.env`.

Create the env file from:

```bash
deploy/backend/.env.production.example
```

Important production values:

```text
NODE_ENV=production
APP_NAME=weevil
DATABASE_URL=...
REDIS_URL=...
RABBITMQ_URL=...
MINIO_ENDPOINT=...
ENABLE_CORS=true
ENABLE_CSRF=true
WEB_ORIGIN=https://your-vercel-domain.vercel.app,https://your-custom-domain.com
EXTENSION_ORIGINS=chrome-extension://old-extension-id,chrome-extension://new-extension-id
WEB_APP_URL=https://your-custom-domain.com
COOKIE_SAMESITE=none
COOKIE_SECURE=true
NOTIFICATION_GATEWAY_URL=https://your-notification-gateway-domain.com
NOTIFICATION_GATEWAY_API_KEY=...
RUN_PROD_SEED=true
SEED_ADMIN_EMAIL=...
SEED_ADMIN_PASSWORD=...
```

If Postgres, Redis, RabbitMQ, or MinIO run on the host instead of in a Docker
network, point the backend containers to `host.docker.internal`.

### Nginx reverse proxy

With the default `BACKEND_API_BIND=127.0.0.1` and `BACKEND_API_PORT=4000`,
Nginx should proxy the public API domain to the local Docker port:

```nginx
server {
  server_name api-weevil.example.com;

  location / {
    proxy_pass http://127.0.0.1:4000;
    proxy_http_version 1.1;

    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

Then issue HTTPS certificates, for example:

```bash
sudo certbot --nginx -d api-weevil.example.com
```

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

On the VPS, useful checks:

```bash
cd /opt/weevil
docker compose -f compose.prod.yml ps
docker logs -f weevil-api
docker logs -f weevil-worker
```

To reload backend environment changes without deploying a new image:

```bash
cd /opt/weevil
docker compose -f compose.prod.yml up -d api worker
```

`deploy.sh` writes the last deployed `WEEVIL_BACKEND_IMAGE`, `API_BIND`, and
`API_PORT` into the VPS `.env`, so plain Docker Compose commands continue to
use the same image and port binding.

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
so CORS allows the dashboard to call the VPS API. Set `EXTENSION_ORIGINS` to a
comma-separated allowlist of every trusted Weevil extension origin, for example
`chrome-extension://old-id,chrome-extension://new-id`, so cookie-authenticated
captures can pass both CORS and the CSRF origin check while Chrome Web Store IDs
change across local/review/production builds. `EXTENSION_ORIGIN` is still accepted
as a backward-compatible single-origin alias, but new deploys should use
`EXTENSION_ORIGINS`. Set backend `WEB_APP_URL` to the canonical dashboard URL;
workspace invitation emails use it to generate accept-invite links.

`ENABLE_CORS=false` is a permissive bypass: the API reflects any browser origin
instead of enforcing `WEB_ORIGIN` / `EXTENSION_ORIGINS`. `ENABLE_CSRF=false`
skips the cookie-session Origin/Referer CSRF guard. Keep both `true` in normal
production operation.
