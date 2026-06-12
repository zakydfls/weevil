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

cat > "$DEPLOY_ENV_FILE" <<EOF
WEEVIL_BACKEND_IMAGE=$WEEVIL_BACKEND_IMAGE
API_BIND=$API_BIND
API_PORT=$API_PORT
EOF

printf '%s' "$GH_TOKEN" | docker login ghcr.io -u "$GHCR_USERNAME" --password-stdin

docker compose --env-file "$DEPLOY_ENV_FILE" -f "$COMPOSE_FILE" pull
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
