#!/usr/bin/env bash
# =============================================================================
# bootstrap-server.sh — one-time preparation of the Lightsail instance.
#
# Run this once, on the server, before the first deploy:
#
#     ssh bnu-lightsail
#     sudo bash /srv/bnu-scholarships/deploy/bootstrap-server.sh
#
# It is safe to run again: every step checks whether it has already been done.
# -----------------------------------------------------------------------------
# THE MEMORY PROBLEM, STATED PLAINLY
#
# This instance has 2 GB of RAM. Oracle XE wants most of that on its own, and
# it has to share with php-fpm, nginx and Docker itself. Without swap the first
# `docker compose up` gets as far as Oracle allocating its SGA and then the
# kernel OOM-killer takes something — usually the database, sometimes sshd.
#
# 4 GB of swap is what makes the difference between "slow while seeding" and
# "the box falls over". It is not a substitute for RAM and the system will be
# noticeably slower whenever it is being used; it is what keeps a temporary
# spike from being fatal. If this deployment is to carry real load rather than
# demonstrate the system, the honest fix is a 4 GB instance, not more swap.
# =============================================================================
set -euo pipefail

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m    %s\033[0m\n' "$*"; }

if [[ $EUID -ne 0 ]]; then
    echo "Run this with sudo." >&2
    exit 1
fi

# --- 1. Swap -----------------------------------------------------------------
log "Swap"
if swapon --show | grep -q '/swapfile'; then
    warn "already present, leaving it alone"
else
    fallocate -l 4G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=4096
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >>/etc/fstab
    warn "4 GB swapfile created and added to /etc/fstab"
fi

# Oracle in a container is happier when the kernel is reluctant to swap the
# SGA back out. 10 keeps swap as an overflow rather than a working surface.
if [[ "$(sysctl -n vm.swappiness)" != "10" ]]; then
    sysctl -w vm.swappiness=10 >/dev/null
    grep -q '^vm.swappiness' /etc/sysctl.conf || echo 'vm.swappiness=10' >>/etc/sysctl.conf
    warn "vm.swappiness set to 10"
fi

# --- 2. Packages -------------------------------------------------------------
log "Base packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq ca-certificates curl gnupg rsync git

# --- 3. Docker ---------------------------------------------------------------
log "Docker"
if command -v docker >/dev/null 2>&1; then
    warn "already installed: $(docker --version)"
else
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/debian/gpg |
        gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
        >/etc/apt/sources.list.d/docker.list
    apt-get update -qq
    apt-get install -y -qq docker-ce docker-ce-cli containerd.io \
        docker-buildx-plugin docker-compose-plugin
    warn "installed: $(docker --version)"
fi

systemctl enable --now docker

# So the admin user can run docker without sudo. Takes effect on next login.
if ! id -nG admin | grep -qw docker; then
    usermod -aG docker admin
    warn "added 'admin' to the docker group — log out and back in for it to apply"
fi

# --- 4. Docker log rotation --------------------------------------------------
# A container that logs steadily will otherwise fill a 60 GB disk over months,
# and the failure looks like the application breaking rather than the disk
# being full.
log "Docker log rotation"
if [[ ! -f /etc/docker/daemon.json ]]; then
    mkdir -p /etc/docker
    cat >/etc/docker/daemon.json <<'JSON'
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "3" }
}
JSON
    systemctl restart docker
    warn "capped container logs at 3 x 10 MB"
else
    warn "/etc/docker/daemon.json exists, leaving it alone"
fi

# --- 5. Application directory ------------------------------------------------
log "Application directory"
mkdir -p /srv/bnu-scholarships
chown -R admin:admin /srv/bnu-scholarships
warn "/srv/bnu-scholarships ready"

# --- 6. Firewall -------------------------------------------------------------
# Lightsail's own firewall is the one that matters and it is configured in the
# AWS console, not here. This only reports what the instance itself thinks.
log "Firewall"
warn "Open 22 (SSH) and 80 (HTTP) in the Lightsail console under Networking."
warn "Do NOT open 1521 — Oracle is reachable only over the compose network."

log "Done"
cat <<'NEXT'

    Next, from your own machine:

        bash deploy/deploy.sh

    That builds the SPA locally, copies it and the API here, and starts the
    stack. The first run takes 10-15 minutes because Oracle has to start for
    the first time and the schema has to be created.

NEXT
