#!/usr/bin/env bash
# =============================================================================
# deploy.sh — build here, ship there, restart.
#
# Run from the repository root on your own machine (Git Bash on Windows):
#
#     bash deploy/deploy.sh
#
# Environment, all optional:
#     SSH_HOST     default bnu-lightsail   (an entry in ~/.ssh/config)
#     REMOTE_DIR   default /srv/bnu-scholarships
#     SEED         default 0               set to 1 to seed the demo register
#     FRESH        default 0               set to 1 to DROP AND REBUILD the schema
#
# -----------------------------------------------------------------------------
# WHY THE SPA IS BUILT HERE AND NOT THERE
#
# `vite build` peaks well above a gigabyte, and on a 2 GB box with Oracle
# already resident that is the OOM-killer's problem rather than Vite's. Node is
# not installed on the server at all, and does not need to be: the build output
# is static files. So the build happens on the machine that has the memory for
# it and only dist/ travels.
# =============================================================================
set -euo pipefail

SSH_HOST="${SSH_HOST:-bnu-lightsail}"
REMOTE_DIR="${REMOTE_DIR:-/srv/bnu-scholarships}"
SEED="${SEED:-0}"
FRESH="${FRESH:-0}"

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m    %s\033[0m\n' "$*"; }
die() {
    printf '\n\033[1;31m!!  %s\033[0m\n' "$*" >&2
    exit 1
}

[[ -f package.json && -d api ]] || die "Run this from the repository root."

# Resolved once, here, rather than inside a heredoc. Nesting a command
# substitution that itself contains quotes inside an unquoted heredoc is how
# you get a script that works until the hostname has a character you did not
# expect in it.
HOST_IP="$(ssh -G "$SSH_HOST" | awk '/^hostname /{print $2}')"
[[ -n "$HOST_IP" ]] || die "No 'Host $SSH_HOST' entry in ~/.ssh/config. See deploy/README.md."

# --- 0. Can we reach it at all? ----------------------------------------------
log "Checking the connection to $SSH_HOST ($HOST_IP)"
if ! ssh -o BatchMode=yes -o ConnectTimeout=10 "$SSH_HOST" true 2>/dev/null; then
    die "Cannot reach $SSH_HOST over SSH.

    Check, in this order:
      1. The key is at ~/.ssh/lightsail-bnu.pem and its permissions are locked
         down (see deploy/README.md — Windows refuses a key other accounts can
         read, and says 'UNPROTECTED PRIVATE KEY FILE' when it does).
      2. ~/.ssh/config has the 'Host $SSH_HOST' entry from that README.
      3. Port 22 is open in the Lightsail console under Networking.
      4. The instance is Running, and its public IP still matches the config —
         a Lightsail instance that is stopped and started gets a new one unless
         a static IP is attached."
fi
warn "reachable"

# --- 1. Build ----------------------------------------------------------------
log "Building the SPA"
npm ci --silent
npm run build
[[ -f dist/index.html ]] || die "The build produced no dist/index.html."
warn "dist/ built: $(find dist -type f | wc -l) files"

# --- 2. Ship -----------------------------------------------------------------
# Everything the server needs to run the stack, and nothing else. node_modules
# is 300 MB of files the server never opens; .git is history it does not need;
# qa/ and handover/ are internal documents that have no business on a public
# host at all.
log "Copying to $SSH_HOST:$REMOTE_DIR"
rsync -az --delete \
    --exclude '.git' \
    --exclude 'node_modules' \
    --exclude 'api/vendor' \
    --exclude 'api/storage' \
    --exclude 'api/.env' \
    --exclude '.env*' \
    --exclude 'qa' \
    --exclude 'handover' \
    --exclude '*.pem' \
    ./ "$SSH_HOST:$REMOTE_DIR/"
warn "copied"

# --- 3. First-run configuration ----------------------------------------------
# api/.env is deliberately never copied — it is written once on the server and
# then left alone, so a deploy cannot overwrite the production APP_KEY with a
# development one. Losing APP_KEY invalidates every session and every encrypted
# column, so this is the one file that must not travel.
log "Ensuring api/.env exists on the server"
ssh "$SSH_HOST" bash -euo pipefail -s <<REMOTE
cd "$REMOTE_DIR"

if [[ ! -f deploy/.env ]]; then
    printf 'ORACLE_PASSWORD=%s\n' "\$(openssl rand -hex 16)" > deploy/.env
    chmod 600 deploy/.env
    echo "    generated deploy/.env with a fresh Oracle password"
fi

if [[ ! -f api/.env ]]; then
    cp api/.env.example api/.env
    ORAPW=\$(grep '^ORACLE_PASSWORD=' deploy/.env | cut -d= -f2-)
    sed -i "s|^DB_PASSWORD=.*|DB_PASSWORD=\${ORAPW}|" api/.env
    sed -i "s|^APP_URL=.*|APP_URL=http://${HOST_IP}|" api/.env
    echo "    api/.env created from the example"
fi
REMOTE

# --- 4. Bring the stack up ---------------------------------------------------
log "Starting the stack"
ssh "$SSH_HOST" bash -euo pipefail -s <<REMOTE
cd "$REMOTE_DIR"
set -a; . deploy/.env; set +a

COMPOSE="docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml"

\$COMPOSE up -d --build

echo "    waiting for Oracle to report healthy (first run takes 10-15 min)"
for i in \$(seq 1 120); do
    state=\$(docker inspect --format '{{.State.Health.Status}}' \
        \$(\$COMPOSE ps -q db) 2>/dev/null || echo starting)
    [[ "\$state" == "healthy" ]] && break
    sleep 15
done
[[ "\$state" == "healthy" ]] || { echo "Oracle never became healthy"; \$COMPOSE logs --tail 40 db; exit 1; }
echo "    Oracle is healthy"

\$COMPOSE exec -T api composer install --no-dev --optimize-autoloader --no-interaction

grep -q '^APP_KEY=base64:' api/.env || \$COMPOSE exec -T api php artisan key:generate --force

# php-fpm runs as www-data. artisan run as root leaves a root-owned log it
# cannot write to afterwards, and every later request answers 500 pointing at
# laravel.log. This is that fix, applied every time rather than remembered.
\$COMPOSE exec -T api chown -R www-data:www-data storage bootstrap/cache

if [[ "$FRESH" == "1" ]]; then
    echo "    migrate:fresh — DROPPING the existing schema"
    \$COMPOSE exec -T api php artisan migrate:fresh --force
elif [[ "$SEED" == "1" ]]; then
    \$COMPOSE exec -T api php artisan migrate --force
else
    \$COMPOSE exec -T api php artisan migrate --force
fi

if [[ "$SEED" == "1" || "$FRESH" == "1" ]]; then
    # DemoSeeder refuses to run when APP_ENV=production, which is the default
    # in .env.example and the right default. Seeding the demo register is an
    # explicit request, so it is made explicitly.
    echo "    seeding the demo register"
    \$COMPOSE exec -T -e APP_ENV=local -e SEED_USER_PASSWORD=\${SEED_USER_PASSWORD:-changeme} \
        api php artisan db:seed --force
fi

\$COMPOSE exec -T api php artisan config:cache
\$COMPOSE exec -T api php artisan route:cache

\$COMPOSE ps
REMOTE

# --- 5. Prove it actually answers --------------------------------------------
# curl against the public address, not a container health check. The last time
# this project shipped a broken build, every container was healthy and every
# test was green while the browser got a blank page.
log "Checking the deployed site"

code=$(curl -s -o /dev/null -w '%{http_code}' -m 20 "http://$HOST_IP/" || echo 000)
[[ "$code" == "200" ]] || die "GET / answered $code, not 200."
warn "GET / -> 200"

curl -s -m 20 "http://$HOST_IP/" | grep -qi '<div id="root"' ||
    die "The page served has no #root element — nginx is not serving dist/."
warn "index.html carries the app root"

code=$(curl -s -o /dev/null -w '%{http_code}' -m 20 \
    -H 'Accept: application/json' -H "Origin: http://$HOST_IP" \
    "http://$HOST_IP/sanctum/csrf-cookie" || echo 000)
[[ "$code" == "204" ]] || die "GET /sanctum/csrf-cookie answered $code, not 204.
    A 200 returning HTML means nginx is answering it instead of Laravel, and
    cookie authentication is structurally broken."
warn "GET /sanctum/csrf-cookie -> 204"

code=$(curl -s -o /dev/null -w '%{http_code}' -m 20 \
    -H 'Accept: application/json' "http://$HOST_IP/api/auth/me" || echo 000)
[[ "$code" == "401" ]] || warn "GET /api/auth/me answered $code (401 expected when signed out)"
warn "API is answering"

log "Deployed"
echo "    http://$HOST_IP/"
