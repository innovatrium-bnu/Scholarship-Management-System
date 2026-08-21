#!/usr/bin/env bash
# =============================================================================
# install-hooks.sh
#
# Points git at the .githooks directory in this repository.
#
#     ./scripts/install-hooks.sh
#
# Run this once after cloning. Every person who clones the repository has to
# run it, on every machine they clone to.
#
# -----------------------------------------------------------------------------
# WHY THIS IS A MANUAL STEP
#
# Git deliberately does not run hooks from a clone. If it did, cloning any
# repository from the internet would execute its author's code on your machine.
# The consequence is that a hook committed to a repository protects nobody
# until each person opts in, which is what this script does by setting
# core.hooksPath in the local git config.
#
# That means the hook is a safety net for honest mistakes, not a control. It
# will stop you committing a .env by accident. It cannot stop somebody who has
# decided to. The controls that do not depend on goodwill are .gitignore, code
# review before merging to main, and secret scanning in CI.
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

if [ -t 1 ]; then
    C_RESET=$'\033[0m'; C_RED=$'\033[31m'; C_GREEN=$'\033[32m'; C_YELLOW=$'\033[33m'
else
    C_RESET=''; C_RED=''; C_GREEN=''; C_YELLOW=''
fi

die() { printf '%s\n' "${C_RED}ERROR${C_RESET} $*" >&2; exit 1; }
ok()  { printf '%s\n' "${C_GREEN}OK${C_RESET}   $*"; }
warn(){ printf '%s\n' "${C_YELLOW}NOTE${C_RESET} $*"; }

command -v git >/dev/null 2>&1 || die "git is not installed"

cd "${REPO_ROOT}"
git rev-parse --git-dir >/dev/null 2>&1 || die "${REPO_ROOT} is not a git repository.
     If this is a fresh copy, run:  git init"

[ -d "${REPO_ROOT}/.githooks" ] || die "No .githooks directory in ${REPO_ROOT}"
[ -f "${REPO_ROOT}/.githooks/pre-commit" ] || die "No .githooks/pre-commit found"

git config core.hooksPath .githooks
ok "git will now use .githooks in this repository"

# Windows checkouts do not carry the executable bit. Git for Windows runs hooks
# through its bundled shell regardless, so this is a no-op there and a
# necessity on Linux.
chmod +x "${REPO_ROOT}/.githooks/"* 2>/dev/null || true

printf '\n'
printf 'What the hook blocks:\n'
printf '  1. Filenames that should never be committed: .env, database dumps,\n'
printf '     spreadsheets, CSV exports, backup archives.\n'
printf '  2. Files larger than the size limit, which is how a database dump\n'
printf '     or an unwanted folder of images usually arrives.\n'
printf '  3. Secrets and student-data patterns found by gitleaks.\n'
printf '\n'

# -----------------------------------------------------------------------------
# Report on gitleaks, but do not fail. Checks 1 and 2 are pure shell and work
# with nothing installed, which is the point of layering them that way: the
# protection that matters most still works when Docker is closed.
# -----------------------------------------------------------------------------
if command -v gitleaks >/dev/null 2>&1; then
    ok "gitleaks found on PATH: $(gitleaks version 2>/dev/null | head -n 1)"
elif command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
    ok "gitleaks will run through Docker (ghcr.io/gitleaks/gitleaks)"
    warn "First commit will be slow while the image downloads."
else
    warn "gitleaks is not available, and neither is a running Docker daemon."
    printf '     Checks 1 and 2 still work. Content scanning does not.\n'
    printf '\n'
    printf '     To enable it, either start Docker, or install the binary from\n'
    printf '     https://github.com/gitleaks/gitleaks/releases and put it on PATH.\n'
fi

printf '\n'
ok "Done. Test it with:  printf \"x\" > .env && git add -f .env && git commit -m test"
printf '     That commit should be refused. Then:  git reset .env && rm .env\n'
