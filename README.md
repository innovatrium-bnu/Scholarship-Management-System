# BNU Scholarship Management System

Manages scholarship definitions, student eligibility, and award assignment for
Beaconhouse National University — including how overlapping scholarships combine
against a 100% fee ceiling, and a full audit trail of every change.

---

## Requirements

|                 |                                                         |
| --------------- | ------------------------------------------------------- |
| Node.js         | 22.x or newer (`node -v`)                               |
| Package manager | **npm** — do not use bun or pnpm, the lockfile is npm's |
| Database        | Oracle 19c — runs in Docker, nothing to install locally |

## Getting started

```bash
npm ci          # install exactly the locked dependency tree
npm run dev     # dev server on http://localhost:8080
```

Use `npm ci` rather than `npm install` — it installs from `package-lock.json`
exactly. Dependency versions in `package.json` are pinned (no `^` ranges) so
that a fresh install cannot silently pull a newer minor version.

`npm ci` also points git at [`.githooks/`](.githooks/) via the `prepare` script,
which turns on the pre-commit checks described under
[Secret and student data protection](#secret-and-student-data-protection). If
that step is skipped for any reason, run it by hand:

```bash
sh scripts/install-hooks.sh
```

## Commands

| Command              | What it does                            |
| -------------------- | --------------------------------------- |
| `npm run dev`        | Dev server with hot reload on port 8080 |
| `npm test`           | Run the unit test suite once            |
| `npm run test:watch` | Re-run tests on change                  |
| `npm run build`      | Production build into `dist/`           |
| `npm run preview`    | Serve the production build locally      |
| `npm run lint`       | ESLint                                  |
| `npm run format`     | Prettier, writes in place               |

## Running the backend

The API is Laravel on Oracle, in [`api/`](api/). It runs in Docker, so
nothing needs PHP or Oracle installed on the machine:

```bash
docker compose up -d
docker compose exec api composer install
docker compose exec api php artisan key:generate
docker compose exec -e SEED_USER_PASSWORD=changeme api php artisan migrate --seed
```

That gives you nginx on **http://localhost:8000**, serving `/api` from Laravel
and everything else from `dist/`. The React dev server on port 8080 is still the
one to develop against; it talks to the API on 8000.

The seed creates one account per role — `super.admin@bnu.edu.pk`,
`admin@bnu.edu.pk`, `data.entry@bnu.edu.pk`, `reporting@bnu.edu.pk` — and a demo
register of 2,000 generated students with eleven scholarships, six hundred
awards, a review queue, and fourteen donors with their pledges and receipts. Passwords are generated and printed once at seed
time; `SEED_USER_PASSWORD` pins them for local work and should never be set
anywhere else.

Set `DEMO_STUDENTS` to change the size of the register. `DemoSeeder` declines to
run in production, and declines to add to a register that already holds
students unless `DEMO_REPLACE=1` says to clear it first.

| Command                                                        | What it does                        |
| -------------------------------------------------------------- | ----------------------------------- |
| `docker compose exec api php artisan migrate`                  | Apply new migrations                |
| `docker compose exec api php artisan migrate:fresh --seed`     | Rebuild the schema from scratch     |
| `docker compose exec api ./vendor/bin/pest`                    | Run the PHP test suite              |
| `docker compose exec db sqlplus bnu/bnu@localhost:1521/XEPDB1` | A SQL*Plus prompt on the dev schema |

Three things about this setup are deliberate and worth knowing before changing
them:

- **`vendor/`, `storage/` and `bootstrap/cache` are Docker volumes, not bind
  mounts.** Composer's atomic renames fail on a Windows bind mount, and php-fpm
  runs as `www-data`, which cannot write to a directory owned by the host user.
- **Tests run against `bnu_test`, a separate schema.** In Oracle a user _is_ a
  schema, so the isolation comes from `DB_USERNAME`, not `DB_DATABASE` — both
  connect to the same PDB. `DB_*` is set in `api/.env` and nowhere else —
  putting it in `docker-compose.yml` as well would make it a real process
  environment variable, which outranks `phpunit.xml`, and a test run would then
  wipe the development schema.
- **The test suite needs Oracle, not SQLite.** The schema uses CLOB columns
  under `IS JSON` check constraints, `NUMBER(1)` booleans, and a
  `DEFERRABLE INITIALLY DEFERRED` unique constraint that precedence reordering
  depends on; a SQLite run would pass without proving anything.

## Deploying to a BNU server

The build is a single-page app: `npm run build` emits static assets into
`dist/`, and any web server can serve them. There is no Node process in
production.

```bash
npm ci
npm run build                      # produces dist/
```

Copy `dist/` to the server and point nginx at it. Two rules matter — send
`/api/` to Laravel, and fall everything else back to `index.html` so the
client-side router can handle deep links like `/students/F23-BSCS-001`:

```nginx
server {
    root /srv/bnu-scholarships/dist;

    location /api/ {
        proxy_pass http://127.0.0.1:9000;   # php-fpm / Laravel
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Serving the app and the API from the same origin is deliberate: it keeps
Sanctum's session cookie simple and avoids CORS entirely.

> **This was previously a TanStack Start app** rendered by its own Nitro Node
> server and deployed as `.output/` under systemd. With Laravel serving the API
> there was no reason to run a second backend, so SSR was dropped in favour of a
> plain Vite SPA. The routes and components did not change; only the shell did.
> The Vercel demo target went with it, since Vercel does not host the PHP
> backend the app now depends on.

## Architecture

| Layer    | Technology                                                                                         |
| -------- | -------------------------------------------------------------------------------------------------- |
| Frontend | React 19 SPA, built with Vite 8                                                                    |
| Routing  | TanStack Router — routes are files in [`src/routes/`](src/routes/)                                 |
| UI       | React 19, Tailwind CSS 4, shadcn/ui/Radix components in [`src/components/ui/`](src/components/ui/) |
| Charts   | Recharts                                                                                           |
| Backend  | Laravel + Oracle 19c (in progress — see Status)                                                    |
| Language | TypeScript, `strict` mode                                                                          |

### Where the important logic lives

| Path                                                                 | Responsibility                                                                                                              |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| [`src/lib/scholarship/types.ts`](src/lib/scholarship/types.ts)       | The domain model — scholarships, students, awards, audit entries                                                            |
| [`src/lib/scholarship/evaluate.ts`](src/lib/scholarship/evaluate.ts) | **Eligibility engine.** Scope filters, automatic/manual rules, cohort-rank percentiles                                      |
| [`src/lib/scholarship/merge.ts`](src/lib/scholarship/merge.ts)       | **Money.** How overlapping awards combine, precedence, trimming, suppression, the 100% ceiling                              |
| [`src/lib/scholarship/funds.ts`](src/lib/scholarship/funds.ts)       | **Donor money.** What is pledged, what has arrived, what is still unassigned, and when a commitment needs renewing          |
| [`src/lib/scholarship/store.tsx`](src/lib/scholarship/store.tsx)     | Application state and every mutation, each of which writes an audit entry                                                   |
| [`src/lib/scholarship/seed.ts`](src/lib/scholarship/seed.ts)         | The original demo generator. No screen reads it; [`api/database/seeders/Demo/`](api/database/seeders/Demo/) is the live one |

`src/routeTree.gen.ts` is generated by the router plugin. Never edit it by hand.

### Two concepts worth understanding before changing anything

**Precedence is array order.** A scholarship's position in the `scholarships`
array _is_ its priority — index 0 wins first claim on a fee head. This is what
the drag-and-drop page at `/settings/precedence` reorders. In the Oracle schema
it is an explicit integer column instead.

**Scholarships are never versioned.** A scholarship has one set of terms for
life. If terms change for a newer intake, that is a _new_ scholarship scoped to
those batches via `batchMode` / `batchFrom`. Nothing is ever hard-deleted either
— archiving is reversible, because an awarded scholarship is part of a student's
financial record.

## Tests

```bash
npm test
```

Tests cover the two pure modules that decide who gets a scholarship and how much
money it is worth — [`evaluate.ts`](src/lib/scholarship/evaluate.ts) and
[`merge.ts`](src/lib/scholarship/merge.ts). They exist to catch regressions in
the fee arithmetic, where a silent error means a student is charged the wrong
amount and nobody notices for a semester.

**If you change merge or eligibility logic, these tests should fail.** If they
still pass, the change was not covered — add a case.

Test helpers are in
[`src/lib/scholarship/test-factories.ts`](src/lib/scholarship/test-factories.ts):
each factory returns a valid default and takes a patch, so a test states only
the fields it cares about.

## Source control

This repository is hosted on a self-managed [Forgejo](https://forgejo.org)
instance run by the university, not on a third-party service. The code for a
system that will hold student scholarship records stays on infrastructure BNU
controls.

The stack that runs the forge, its backup and restore scripts, and the runbook
for moving it onto a BNU-managed server all live in a separate repository,
`bnu-forgejo`. That repository is administered by BNU IT and is not needed to
work on this application.

Access is granted through organization teams, not individual collaborators,
because only teams support per-unit permissions:

| Role       | Can do                                                                            |
| ---------- | --------------------------------------------------------------------------------- |
| Developers | Push feature branches, open pull requests, work on issues. Cannot merge to `main` |
| Maintainer | The above, plus reviewing and merging to `main`                                   |
| Committee  | Read issues and the wiki. No access to code                                       |

`main` is held by a branch protection rule, not by the team settings. Team
permissions grant write to the repository as a whole, including `main`. Work on
a branch and open a pull request.

Documentation written for the Scholarship Committee goes in the repository
**wiki**, not in this tree. A team with Code: No Access cannot see files here, so
a `docs/` folder would be invisible to exactly the people it was written for.
Developer documentation, meaning this file and [`AGENTS.md`](AGENTS.md), stays
next to the code it describes.

The full access model is in the `bnu-forgejo` repository's README.

## Secret and student data protection

The realistic accident on this project is not an attacker. It is somebody, in a
hurry, committing one of three things:

1. A `.env` file holding real credentials.
2. A database dump or a spreadsheet export containing real student records.
3. A seed or fixture script populated from real data instead of generated.

The second is the serious one. Once a real student record is in git history it is
in every clone anybody ever made, and removing it means rewriting history and
asking every developer to re-clone.

Three layers guard against it:

| Layer             | File                                 | Needs                                           |
| ----------------- | ------------------------------------ | ----------------------------------------------- |
| Ignore rules      | [`.gitignore`](.gitignore)           | Nothing                                         |
| Pre-commit checks | [`.githooks/pre-commit`](.githooks/) | Nothing for filename and size checks            |
| Content scanning  | [`.gitleaks.toml`](.gitleaks.toml)   | The gitleaks binary, or a running Docker daemon |

The hook refuses any `.env` other than `.env.example`, any `.sql`, `.csv`,
`.xlsx` or similar data file, any key or certificate, and anything over 5 MB. It
then scans the staged content for secrets and for personal data patterns,
including Pakistani CNIC numbers.

Some patterns are checked only inside data files rather than everywhere.
[`seed.ts`](src/lib/scholarship/seed.ts) legitimately produces registration
numbers like `F2025-001` and addresses like `name@bnu.edu.pk`, so a rule applied
to TypeScript would fire on correct code several times a day and be switched off
within a week. Inside a committed `.sql` or `.csv`, the same pattern means
something has genuinely gone wrong. The reasoning is written out in
`.gitleaks.toml`.

If gitleaks is not available, the commit is allowed with a visible warning rather
than blocked. The filename and size checks still run. A hook that blocks all work
whenever Docker happens to be closed gets uninstalled, and an uninstalled hook
protects nothing.

**This is a safety net, not a control.** Git deliberately does not run hooks from
a clone, so each person has to opt in on each machine, and anyone can pass
`--no-verify`. It catches mistakes. The controls that do not depend on goodwill
are `.gitignore`, review before merging to `main`, and secret scanning in CI.

### The rule that does not bend

**No real student data in this repository, ever.** Test and seed data must be
visibly synthetic and generated.
[`api/database/seeders/Demo/`](api/database/seeders/Demo/) builds its 2,000
students arithmetically for this reason: given and family names are drawn from
two short lists by a hash of the row index, and every other field — phone
number, address, date of birth — follows from the same arithmetic. Nothing calls
`rand()`. There is no real person in it, no file to accidentally replace with a
real export, and a reviewer can see both from the code.

Real student data will arrive over an interface from the BNU CMS, and never as a
file in this tree. What we need from that interface is written down in
[`api-requirements.md`](api-requirements.md).

When the Oracle backend lands, this becomes the live constraint rather than a
precaution. Migrations belong in git. Dumps of a real database never do.

## Status

The system is complete and end to end. The React SPA talks to a Laravel API on
Oracle: [`store.tsx`](src/lib/scholarship/store.tsx) is backed by real requests,
data persists across a refresh, and every screen is behind a sign-in that the
server enforces.

Migration to React + Laravel + Oracle, in order:

1. ~~Drop TanStack Start for a plain Vite SPA, so Laravel is the only backend~~ **done**
2. ~~Schema and migrations for the entities in `types.ts`, with `precedence` as a
   real column~~ **done** — it was the array index in `scholarships[]`; it is now
   a `DEFERRABLE INITIALLY DEFERRED` unique column, so a reorder can pass through
   a duplicate state inside its transaction and still be checked at commit
3. ~~Port the money and eligibility modules to PHP services~~ **done** — all 132
   Vitest cases across the five modules are mirrored in Pest and passing
4. ~~A Laravel endpoint per store mutation~~ **done** — 36 routes, with batch
   assign/undo and approve-creates-award as real database transactions, and
   ULIDs from the database in place of the client-side `aw-${Date.now()}`
5. ~~Sanctum session auth~~ **done** — [`can()`](src/lib/scholarship/roles.ts) is
   mirrored by `App\Auth\RoleMatrix` and enforced as a gate on every write; a
   test parses `roles.ts` and fails if the two disagree
6. ~~Point the SPA at the API~~ **done** — the store is TanStack Query over
   `fetch`, the lookups come from the `reference` endpoint rather than from
   hardcoded arrays, and there is a sign-in screen instead of a role picker

What is deliberately not done, and why:

- **The register is loaded whole.** The students endpoint paginates and the
  store walks it to the end, because the list screens filter in memory as they
  did against the seed. At 5,000 students that is 25 requests on first load;
  server-side search per screen is the fix.
- **No file upload.** Application documents are metadata; the storage column is
  absent rather than nullable, so nothing half-works.

The pure domain modules stay in TypeScript as well as PHP — the browser needs
them to draw coverage bars and ceiling warnings without a round trip. Laravel is
authoritative on every write; the TypeScript copy is for display only.

Zod and TanStack Query are installed and still unused. They are for step 4,
where `store.tsx` keeps its exact `StoreCtx` interface but talks to Laravel
underneath — which is what lets all 20 of its consumers stay untouched.
