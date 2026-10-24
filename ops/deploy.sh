#!/bin/sh
set -eu
: "${APP_IMAGE:?APP_IMAGE must be an immutable image tag}"
previous=$(docker inspect --format '{{.Config.Image}}' "$(docker compose ps -q app)" 2>/dev/null || true)
docker compose pull app realtime
docker compose up -d mysql redis
docker compose run --rm app pnpm db:deploy
docker compose run --rm app pnpm db:seed
docker compose up -d --no-build app realtime proxy
attempt=0
while [ "$attempt" -lt 12 ]; do
  if docker compose exec -T app node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then
    printf '%s\n' "$APP_IMAGE" > .deployed-image
    exit 0
  fi
  attempt=$((attempt + 1))
  sleep 5
done
if [ -n "$previous" ]; then
  export APP_IMAGE="$previous"
  docker compose up -d --no-build app realtime
fi
echo 'Deployment health check failed; previous image restored when available.' >&2
exit 1
