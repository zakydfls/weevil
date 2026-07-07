#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${APP_DIR:-$HOME/weevil}"
COMPOSE_FILE="${COMPOSE_FILE:-compose.prod.yml}"
DEPLOY_ENV_FILE="${DEPLOY_ENV_FILE:-.deploy.env}"
API_BIND="${API_BIND:-127.0.0.1}"
API_PORT="${API_PORT:-4000}"
RUN_PROD_SEED="${RUN_PROD_SEED:-}"

read_dotenv_value() {
  local key="$1"
  local line value

  line="$(grep -E "^[[:space:]]*${key}[[:space:]]*=" .env | tail -n 1 || true)"
  if [[ -z "$line" ]]; then
    return 1
  fi

  value="${line#*=}"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"

  if [[ "$value" == \"*\" && "$value" == *\" ]]; then
    value="${value:1:${#value}-2}"
  elif [[ "$value" == \'*\' && "$value" == *\' ]]; then
    value="${value:1:${#value}-2}"
  fi

  printf '%s' "$value"
}

write_dotenv_value() {
  local key="$1"
  local value="$2"
  local file="$3"
  local temp_file

  if grep -Eq "^[[:space:]]*${key}[[:space:]]*=" "$file"; then
    temp_file="$(mktemp)"
    awk -v key="$key" -v value="$value" '
      $0 ~ "^[[:space:]]*" key "[[:space:]]*=" {
        if (!written) {
          print key "=" value
          written = 1
        }
        next
      }
      { print }
      END {
        if (!written) {
          print key "=" value
        }
      }
    ' "$file" > "$temp_file"
    cat "$temp_file" > "$file"
    rm -f "$temp_file"
    return
  fi

  printf '\n%s=%s\n' "$key" "$value" >> "$file"
}

if [[ -z "${WEEVIL_BACKEND_IMAGE:-}" ]]; then
  echo "WEEVIL_BACKEND_IMAGE is required" >&2
  exit 1
fi

if [[ -z "${GHCR_USERNAME:-}" || -z "${GH_TOKEN:-}" ]]; then
  echo "GHCR_USERNAME and GH_TOKEN are required for ghcr.io login" >&2
  exit 1
fi

mkdir -p "$APP_DIR"
cd "$APP_DIR"

if [[ ! -f ".env" ]]; then
  echo "Missing $APP_DIR/.env. Create it from deploy/backend/.env.production.example before deploying." >&2
  exit 1
fi

if [[ -z "$RUN_PROD_SEED" ]]; then
  RUN_PROD_SEED="$(read_dotenv_value RUN_PROD_SEED || true)"
fi
RUN_PROD_SEED="${RUN_PROD_SEED:-false}"

write_dotenv_value WEEVIL_BACKEND_IMAGE "$WEEVIL_BACKEND_IMAGE" .env
write_dotenv_value API_BIND "$API_BIND" .env
write_dotenv_value API_PORT "$API_PORT" .env

cat > "$DEPLOY_ENV_FILE" <<EOF
WEEVIL_BACKEND_IMAGE=$WEEVIL_BACKEND_IMAGE
API_BIND=$API_BIND
API_PORT=$API_PORT
EOF

printf '%s' "$GH_TOKEN" | docker login ghcr.io -u "$GHCR_USERNAME" --password-stdin

docker compose --env-file "$DEPLOY_ENV_FILE" -f "$COMPOSE_FILE" pull

# One-time recovery for a bad migration that was shipped with a reference to a
# later table. The migration SQL is now idempotent, but Prisma refuses to apply
# any new migration while this row is marked failed in _prisma_migrations.
docker compose --env-file "$DEPLOY_ENV_FILE" -f "$COMPOSE_FILE" run --rm migrate \
  pnpm prisma migrate resolve --rolled-back 20260707090148_add_network_request_resource_type \
  || true

docker compose --env-file "$DEPLOY_ENV_FILE" -f "$COMPOSE_FILE" run --rm migrate

case "${RUN_PROD_SEED,,}" in
  true|1|yes|on)
    echo "RUN_PROD_SEED=$RUN_PROD_SEED; running production seed."
    docker compose --env-file "$DEPLOY_ENV_FILE" -f "$COMPOSE_FILE" run --rm seed
    ;;
  *)
    echo "RUN_PROD_SEED=$RUN_PROD_SEED; skipping production seed."
    ;;
esac

docker compose --env-file "$DEPLOY_ENV_FILE" -f "$COMPOSE_FILE" up -d api worker
docker compose --env-file "$DEPLOY_ENV_FILE" -f "$COMPOSE_FILE" ps

docker image prune -f --filter "until=168h" >/dev/null || true
