#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."
docker compose exec -T app node -e '
  fetch("http://127.0.0.1:3000/api/cron/tick", {
    headers: { Authorization: "Bearer " + process.env.CRON_SECRET },
    signal: AbortSignal.timeout(60000),
  }).then(response => { if (!response.ok) process.exit(1); }).catch(() => process.exit(1));
'
