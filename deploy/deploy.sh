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
#     REPLACE      default 0               set to 1 to clear and rebuild the demo
#                                          register (needs SEED=1; deletes any
#                                          changes made through the interface)
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
REPLACE="${REPLACE:-0}"

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
# `npm ci` only when there is nothing installed yet.
#
# It is the more correct command — it installs exactly the lockfile and nothing
# else — but it begins by deleting node_modules, and on Windows that fails with
# EPERM the moment any native .node file is held open, which lightningcss's is
# whenever a Vite process has run recently. A deploy that cannot run twice in a
# row because a file is locked is worse than one that trusts an existing
# install, so the existing install is trusted and the lockfile check below is
# what catches a genuinely stale tree.
log "Building the SPA"
if [[ ! -d node_modules ]]; then
    warn "no node_modules — installing from the lockfile"
    npm ci
elif [[ package-lock.json -nt node_modules ]]; then
    warn "package-lock.json is newer than node_modules — installing"
    npm install --no-audit --no-fund
else
    warn "using the installed node_modules"
fi

npm run build
[[ -f dist/index.html ]] || die "The build produced no dist/index.html."
[[ -d dist/assets ]] || die "The build produced no dist/assets."

# Strip public/modification/ back out of the build.
#
# .gitignore refuses to commit that directory because it is third-party UI
# mockups carrying a visible stock-image watermark, and its comment says
# exactly why: "Anything under public/ is served publicly by the app, so
# committing these would ship watermarked stock art to production."
#
# Not committing them was never sufficient. Vite copies everything in public/
# into dist/ verbatim, so the files reach production through the build whether
# or not git ever saw them — 3 MB of watermarked stock art, on a public URL,
# under BNU's name. The gitignore stops them entering the repository; this
# stops them leaving it.
if [[ -d dist/modification ]]; then
    rm -rf dist/modification
    warn "removed dist/modification (watermarked mockups, not ours to publish)"
fi

warn "dist/ built: $(find dist -type f | wc -l) files"

# --- 2. Ship -----------------------------------------------------------------
# tar over ssh rather than rsync, because Git Bash on Windows ships no rsync
# and installing one to copy a few megabytes is a dependency this does not need.
# Everything the server has to have, and nothing else.
#
# What is deliberately left behind, and why each one matters:
#
#   .env.local, api/.env   development secrets. api/.env in particular holds
#                          the local APP_KEY; overwriting the server's would
#                          invalidate every session and every encrypted column.
#   *.pem                  a private key must never travel to the host it opens.
#   qa/, handover/         internal documents. They describe the system's
#                          weaknesses and have no business on a public server.
#   node_modules, .git     300 MB the server never opens, and history it does
#                          not need.
#
# api/.env.example is NOT excluded — the server builds its own api/.env from it.
log "Copying to $SSH_HOST:$REMOTE_DIR"

# dist/ is emptied first so a rename in the build cannot leave last deploy's
# asset files behind, served forever to anyone holding a stale index.html.
#
# Emptied, not removed. `rm -rf dist` replaces the directory with a new one at a
# new inode, and the web container bind-mounts that path — so a running nginx
# goes on looking at the deleted directory and serves 403 "directory index of
# /var/www/dist/ is forbidden" from what it sees as an empty mount, while the
# host has every file present and correct. Deleting the contents leaves the
# inode, and the mount, intact.
ssh "$SSH_HOST" "mkdir -p '$REMOTE_DIR/dist' && find '$REMOTE_DIR/dist' -mindepth 1 -delete"

tar -czf - \
    --exclude='.git' \
    --exclude='node_modules' \
    --exclude='.tanstack' \
    --exclude='api/vendor' \
    --exclude='api/storage' \
    --exclude='api/.env' \
    --exclude='.env.local' \
    --exclude='./.env' \
    --exclude='qa' \
    --exclude='handover' \
    --exclude='*.pem' \
    . | ssh "$SSH_HOST" "tar -xzf - -C '$REMOTE_DIR'"

# Prove the exclusions held rather than trusting the flags. A secret that
# reaches the server because a pattern did not match is not something to find
# out about later.
#
# api/.env is deliberately not in this list even though it is excluded from the
# transfer: the server writes its own in step 3 and it is supposed to be there.
# Checking for its existence would fail on every run after the first. What
# matters is that *this machine's* copy did not overwrite it, which is what the
# content comparison below actually tests.
leaked=$(ssh "$SSH_HOST" "cd '$REMOTE_DIR' && \
    ls .env.local 2>/dev/null; \
    find . -name '*.pem' -o -name handover -o -name qa 2>/dev/null | head -5")
[[ -z "$leaked" ]] || die "These should not have been copied and were:
$leaked"

if [[ -f api/.env ]]; then
    lkey=$(grep -m1 '^APP_KEY=' api/.env 2>/dev/null || true)
    rkey=$(ssh "$SSH_HOST" "grep -m1 '^APP_KEY=' '$REMOTE_DIR/api/.env' 2>/dev/null" || true)
    if [[ -n "$lkey" && "$lkey" == "$rkey" ]]; then
        die "The server's api/.env has this machine's APP_KEY. The transfer
    overwrote it, which invalidates every session and every encrypted column
    on the server. Check the --exclude='api/.env' pattern before deploying again."
    fi
fi
warn "copied, and no secrets or internal documents went with it"

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
    echo "    api/.env created from the example"
fi

# Two corrections to the example, applied every run because getting either
# wrong produces a connection failure that reads like a broken application.
#
# DB_DATABASE: the example says ORCLPDB1, which is the pluggable database name
# in Oracle's own enterprise image. This deployment runs gvenzl/oracle-xe,
# where it is XEPDB1. The example is right for BNU's server and wrong here.
#
# DB_USERNAME/DB_PASSWORD are deliberately NOT touched. docker/db-init-xe.sql
# hardcodes bnu/bnu, and ORACLE_PASSWORD in deploy/.env is the SYS and SYSTEM
# password, which is a different thing entirely. Writing the latter into
# DB_PASSWORD — which an earlier version of this script did — gives ORA-01017
# on every request.
sed -i "s|^DB_DATABASE=.*|DB_DATABASE=XEPDB1|" api/.env
sed -i "s|^APP_URL=.*|APP_URL=http://${HOST_IP}|" api/.env

# The host has to be in SANCTUM_STATEFUL_DOMAINS or nothing stays signed in.
#
# The example lists only localhost, which is right for development and useless
# here. Sanctum decides whether to authenticate a request from the session
# cookie by matching the Host header against this list; a host that is not on
# it gets the cookie set, sends it back, and is told "Unauthenticated." on
# every request after the login that appeared to succeed. Nothing in the
# response says why, and the cookie is visibly present in the jar, so it reads
# as a session-persistence bug rather than a configuration one.
if grep -q '^SANCTUM_STATEFUL_DOMAINS=' api/.env; then
    sed -i "s|^SANCTUM_STATEFUL_DOMAINS=.*|SANCTUM_STATEFUL_DOMAINS=${HOST_IP}|" api/.env
else
    echo "SANCTUM_STATEFUL_DOMAINS=${HOST_IP}" >> api/.env
fi
REMOTE

# --- 4. Bring the stack up ---------------------------------------------------
log "Starting the stack"
ssh "$SSH_HOST" bash -euo pipefail -s <<REMOTE
cd "$REMOTE_DIR"
set -a; . deploy/.env; set +a

COMPOSE="docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml"

# The database is started on its own first, and waited for here rather than by
# compose.
#
# \`compose up -d\` with api's depends_on: service_healthy does its own waiting,
# and its patience is the healthcheck's (start_period plus retries x interval).
# On this instance the first boot relocates the baked-in database onto the
# volume while swapping, and it overran that budget: compose gave up with
# "dependency failed to start", the restart policy then restarted the
# container, and restarting mid-setup is what made the image skip its
# /container-entrypoint-initdb.d hook — leaving a database with no application
# user in it and an error much further downstream than the cause.
#
# Starting db alone puts the timeout under this script's control, where it can
# be generous, and means nothing else is competing for memory while Oracle
# comes up.
\$COMPOSE up -d --build db </dev/null

echo "    waiting for Oracle (first boot on a fresh volume takes 10-20 min here)"
for i in \$(seq 1 160); do
    state=\$(docker inspect --format '{{.State.Health.Status}}' bnu-scholarships-db-1 2>/dev/null || echo starting)
    [[ "\$state" == "healthy" ]] && break
    sleep 15
done
[[ "\$state" == "healthy" ]] || { echo "Oracle never became healthy"; \$COMPOSE logs --tail 40 db; exit 1; }
echo "    Oracle is healthy"

# Create the application user, every run, rather than trusting the image's
# one-shot init hook.
#
# That hook fires only when the image decides the database is being set up for
# the first time, and a container restart during that window skips it silently.
# The failure then surfaces as ORA-01017 from Laravel, which reads like a
# credentials problem rather than a database that was never finished. Running
# it here is idempotent in effect: ORA-01920 "user name conflicts" on a second
# run is the success case, so its output is only shown when the check below
# actually fails.
#
# The probe selects a word rather than a number. sqlplus pads its output with a
# tab for a numeric column and spaces for a character one, and a pattern
# anchored on leading spaces reported a perfectly good connection as broken.
dbcheck() {
    docker exec bnu-scholarships-db-1 bash -lc \
        "echo \"select 'PING_OK' from dual;\" | sqlplus -s bnu/bnu@localhost:1521/XEPDB1" 2>/dev/null |
        grep -q PING_OK
}

if ! dbcheck; then
    echo "    application user missing — running docker/db-init-xe.sql"
    docker exec bnu-scholarships-db-1 \
        sqlplus -s / as sysdba @/container-entrypoint-initdb.d/10-app-user.sql || true
    dbcheck || {
        echo "The application user still cannot connect after running the init script."
        exit 1
    }
fi
echo "    application user can connect"

# Now the rest, with the database already up and answering.
\$COMPOSE up -d --build </dev/null

# EVERY command below redirects stdin from /dev/null, and it is load-bearing.
#
# This whole block arrives on the remote bash's stdin (bash -s), so any command
# that reads stdin eats the rest of the script. composer install does exactly
# that: it consumed everything after itself, the ssh call returned 0 having
# silently skipped key:generate, the migrations and the seed, and the only
# symptom was a 500 from the deployed site with MissingAppKeyException in
# laravel.log — about as far from the cause as an error can land.
\$COMPOSE exec -T api composer install --no-dev --optimize-autoloader --no-interaction </dev/null

grep -q '^APP_KEY=base64:' api/.env || \$COMPOSE exec -T api php artisan key:generate --force </dev/null

# php-fpm runs as www-data. artisan run as root leaves a root-owned log it
# cannot write to afterwards, and every later request answers 500 pointing at
# laravel.log. This is that fix, applied every time rather than remembered.
\$COMPOSE exec -T api chown -R www-data:www-data storage bootstrap/cache </dev/null

if [[ "$FRESH" == "1" ]]; then
    echo "    migrate:fresh — DROPPING the existing schema"
    \$COMPOSE exec -T api php artisan migrate:fresh --force </dev/null
elif [[ "$SEED" == "1" ]]; then
    \$COMPOSE exec -T api php artisan migrate --force </dev/null
else
    \$COMPOSE exec -T api php artisan migrate --force </dev/null
fi

if [[ "$SEED" == "1" || "$FRESH" == "1" ]]; then
    # DemoSeeder refuses to run when APP_ENV=production, which is the default
    # in .env.example and the right default. Seeding the demo register is an
    # explicit request, so it is made explicitly.
    #
    # DEMO_REPLACE is a second, separate guard inside the seeder: it will not
    # add to a register that already holds students, because doing so would
    # double every row rather than refresh anything. REPLACE=1 is what says
    # "clear the demo tables and rebuild them", and it is deliberately not
    # implied by SEED=1 — the difference between adding demo data to an empty
    # database and deleting what is in a populated one is worth having to type.
    #
    # The generator is deterministic, so a replace rebuilds the identical
    # register. What it does not preserve is anything a person did through the
    # interface since the last seed.
    echo "    seeding the demo register${REPLACE:+ (replacing the existing one)}"
    \$COMPOSE exec -T -e APP_ENV=local -e SEED_USER_PASSWORD=\${SEED_USER_PASSWORD:-changeme} \
        -e DEMO_REPLACE=${REPLACE:-0} \
        api php artisan db:seed --force </dev/null
fi

\$COMPOSE exec -T api php artisan config:cache </dev/null
\$COMPOSE exec -T api php artisan route:cache </dev/null

\$COMPOSE ps </dev/null
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
