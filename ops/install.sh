#!/usr/bin/env bash
set -Eeuo pipefail

if [[ ${1:-} == --help || ${1:-} == -h ]]; then
  printf '%s\n' 'Usage: bash ops/install.sh [domain]' \
    'Run from an uploaded/cloned project on Ubuntu 22.04+ or Debian 12+.' \
    'Point the domain to this VPS and allow TCP 80/443 and UDP 443 first.' \
    'Prompts for Google OAuth and optional SMTP settings on first install.' \
    'An existing .env and database volumes are preserved on subsequent runs.'
  exit 0
fi

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
project_dir=$(cd -- "$script_dir/.." && pwd)
cd -- "$project_dir"
[[ -f package.json && -f docker-compose.yml ]] || { echo 'Project files are missing.' >&2; exit 1; }

if [[ $(id -u) -ne 0 ]]; then
  command -v sudo >/dev/null || { echo 'Run this installer as root.' >&2; exit 1; }
  exec sudo bash "$script_dir/install.sh" "$@"
fi

trap 'code=$?; printf "\nInstallation stopped (exit %s). Check the error above. Existing database volumes are retained.\n" "$code" >&2; exit "$code"' ERR
[[ -f /etc/os-release ]] || { echo 'Ubuntu or Debian is required.' >&2; exit 1; }
. /etc/os-release
case "$ID" in
  ubuntu) minimum_version=22.04 ;;
  debian) minimum_version=12 ;;
  *) echo 'Automatic installation supports Ubuntu and Debian.' >&2; exit 1 ;;
esac
dpkg --compare-versions "$VERSION_ID" ge "$minimum_version" || { echo "Use $ID $minimum_version or newer." >&2; exit 1; }
command -v systemctl >/dev/null || { echo 'A VPS running systemd is required.' >&2; exit 1; }

echo '[1/6] Preparing system packages...'
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y ca-certificates curl python3 cron

echo '[2/6] Preparing application configuration...'
python3 ops/configure_vps.py "$@"
chmod 600 .env

echo '[3/6] Preparing Docker Engine and Compose...'
if ! command -v docker >/dev/null; then
  install -m 0755 -d /etc/apt/keyrings
  curl --fail --silent --show-error --location "https://download.docker.com/linux/$ID/gpg" -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  cat > /etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/$ID
Suites: ${UBUNTU_CODENAME:-$VERSION_CODENAME}
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
docker compose version >/dev/null || { echo 'Docker is installed but Compose v2 is missing. Install the Compose plugin and run this command again.' >&2; exit 1; }
systemctl enable --now docker
docker info >/dev/null
docker compose config --quiet

echo '[4/6] Building the application image...'
docker compose build app

echo '[5/6] Starting MySQL/Redis and applying migrations...'
docker compose up -d --wait --wait-timeout 180 mysql redis
docker compose run --rm --no-deps app pnpm db:deploy
docker compose run --rm --no-deps app pnpm db:seed

echo '[6/6] Starting the website, realtime and scheduled tasks...'
docker compose up -d --no-build --wait --wait-timeout 180 app realtime proxy
docker compose exec -T app node -e 'fetch("http://127.0.0.1:3000/api/health", {signal: AbortSignal.timeout(10000)}).then(r => {if (!r.ok) process.exit(1)}).catch(() => process.exit(1))'

# No credentials are stored in crontab. The worker reads CRON_SECRET inside the app container.
cron_project=$(printf '%q' "$project_dir")
cron_project=${cron_project//%/\\%}
printf 'SHELL=/bin/bash\nPATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin\n*/15 * * * * root cd %s && /bin/bash ops/cron.sh\n' "$cron_project" > /etc/cron.d/capfootball
chmod 644 /etc/cron.d/capfootball
systemctl enable --now cron

python3 - <<'PY'
from ops.configure_vps import read_env
settings = read_env('.env')
print('\nInstalled: ' + settings['AUTH_URL'])
print('Google redirect URI: ' + settings['AUTH_URL'] + '/api/auth/callback/google')
print('Logs: docker compose logs -f app realtime proxy')
print('Update after uploading new code: bash ops/install.sh')
PY
