#!/bin/bash
# Pull-only deploy. Usage: deploy.sh <release-sha>
set -euo pipefail

release="$1"
owner=fernandinhomartins40
cd /opt/precisari

# Images are public, so no login. Isolated config because root's shared one may hold another
# project's expired ghcr.io token, and GHCR rejects even public pulls with a bad credential.
export DOCKER_CONFIG=/opt/precisari/.docker
mkdir -p "$DOCKER_CONFIG"

# Secrets are generated once and live only here. Losing DATA_ENCRYPTION_KEY makes stored
# iCal URLs and Channex tokens unreadable, so this file is never regenerated.
if [ ! -f .env ]; then
  umask 077
  pg_password=$(openssl rand -hex 24)
  cat > .env <<ENV
NODE_ENV=production
API_PORT=3333
API_PUBLIC_URL=https://api.precisari.com.br
WEB_PUBLIC_URL=https://www.precisari.com.br
CORS_ORIGINS=https://www.precisari.com.br
POSTGRES_PASSWORD=$pg_password
DATABASE_URL=postgresql://precisari:$pg_password@postgres:5432/precisari?schema=public
REDIS_URL=redis://redis:6379
JWT_ACCESS_SECRET=$(openssl rand -hex 32)
OTP_HASH_SECRET=$(openssl rand -hex 32)
DATA_ENCRYPTION_KEY=$(openssl rand -base64 32)
BILLING_WEBHOOK_SECRET=$(openssl rand -hex 32)
JOBS_ENABLED=true
ENV
fi

previous=$(sed -n 's/^RELEASE=//p' .env | tail -1)
sed -i '/^RELEASE=/d' .env
echo "RELEASE=$release" >> .env

compose() { docker compose --env-file .env -f deploy/docker-compose.prod.yml "$@"; }

for attempt in 1 2 3 4 5; do
  compose pull api web && break
  [ "$attempt" = 5 ] && { echo "image pull failed" >&2; exit 1; }
  sleep 20
done

compose run --rm migrate
compose up -d --wait --wait-timeout 240 postgres redis api worker web

curl -fsS http://127.0.0.1:3210/v1/health >/dev/null
curl -fsS -o /dev/null http://127.0.0.1:3200/
echo "healthy: release $release"

# Keep the current and previous releases (rollback net). Scoped to this project's images:
# the VPS is shared, so a global prune would delete other applications' images.
docker images --format '{{.Repository}}:{{.Tag}}' \
  | grep -E "^ghcr\.io/$owner/precisari-(api|web):" \
  | grep -vE ":($release${previous:+|$previous})$" \
  | xargs -r docker rmi >/dev/null 2>&1 || true
