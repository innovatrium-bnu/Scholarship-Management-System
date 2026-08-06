# BNU Scholarship Management System

Manages scholarship definitions, student eligibility, and award assignment for
Beaconhouse National University — including how overlapping scholarships combine
against a 100% fee ceiling, and a full audit trail of every change.

---

## Requirements

|                 |                                                             |
| --------------- | ----------------------------------------------------------- |
| Node.js         | 22.x or newer (`node -v`)                                   |
| Package manager | **npm** — do not use bun or pnpm, the lockfile is npm's     |
| Database        | PostgreSQL 16+ _(not yet wired up — see [Status](#status))_ |

## Getting started

```bash
npm ci          # install exactly the locked dependency tree
npm run dev     # dev server on http://localhost:8080
```

Use `npm ci` rather than `npm install` — it installs from `package-lock.json`
exactly. Dependency versions in `package.json` are pinned (no `^` ranges) so
that a fresh install cannot silently pull a newer minor version.

## Commands

| Command              | What it does                                     |
| -------------------- | ------------------------------------------------ |
| `npm run dev`        | Dev server with hot reload on port 8080          |
| `npm test`           | Run the unit test suite once                     |
| `npm run test:watch` | Re-run tests on change                           |
| `npm run build`      | Production build into `.output/`                 |
| `npm start`          | Run the production build (after `npm run build`) |
| `npm run lint`       | ESLint                                           |
| `npm run format`     | Prettier, writes in place                        |

## Deploying to a BNU server

The build targets Nitro's `node-server` preset, which emits a self-contained
Node application — no serverless platform or vendor runtime required.

```bash
npm ci
npm run build                      # produces .output/
PORT=3000 node .output/server/index.mjs
```

`.output/` is everything the server needs. Deploy by copying that directory plus
`package.json`, or by building on the server itself.

To run it as a service, point systemd at the same command and put nginx in front
for TLS:

```ini
# /etc/systemd/system/bnu-scholarships.service
[Service]
WorkingDirectory=/srv/bnu-scholarships
Environment=NODE_ENV=production
Environment=PORT=3000
ExecStart=/usr/bin/node .output/server/index.mjs
Restart=always
```

## Deploying the demo to Vercel

The Vercel project builds from this repository and serves the demo. Nothing
special is needed to make that work: Vercel sets `VERCEL=1` in its build
environment, and [`vite.config.ts`](vite.config.ts) switches the Nitro preset to
`vercel` when it sees it, emitting `.vercel/output/` instead of `.output/`.

The university's own server remains the real target, and it is the default
everywhere else — a local `npm run build` cannot accidentally produce Vercel
output, and a Vercel build cannot accidentally produce an on-premise one.

To check the Vercel build by hand:

```bash
NITRO_PRESET=vercel npm run build     # produces .vercel/output/
```

`NITRO_PRESET` overrides the detection either way, which is the escape hatch if
a third target is ever added.

> The demo carries the same seeded, in-memory data as a local run, and it is
> regenerated on every page load. No student record is stored on Vercel, because
> there is no database yet. That changes the day the PostgreSQL backend lands,
> and the deployment target should be reconsidered then — university records
> should not sit on a third-party host without that being a decision somebody
> signed.

## Architecture

| Layer     | Technology                                                                                         |
| --------- | -------------------------------------------------------------------------------------------------- |
| Framework | TanStack Start (SSR + file-based routing + server functions)                                       |
| Routing   | TanStack Router — routes are files in [`src/routes/`](src/routes/)                                 |
| UI        | React 19, Tailwind CSS 4, shadcn/ui/Radix components in [`src/components/ui/`](src/components/ui/) |
| Charts    | Recharts                                                                                           |
| Build     | Vite 8 + Nitro 3                                                                                   |
| Language  | TypeScript, `strict` mode                                                                          |

### Where the important logic lives

| Path                                                                 | Responsibility                                                                                 |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| [`src/lib/scholarship/types.ts`](src/lib/scholarship/types.ts)       | The domain model — scholarships, students, awards, audit entries                               |
| [`src/lib/scholarship/evaluate.ts`](src/lib/scholarship/evaluate.ts) | **Eligibility engine.** Scope filters, automatic/manual rules, cohort-rank percentiles         |
| [`src/lib/scholarship/merge.ts`](src/lib/scholarship/merge.ts)       | **Money.** How overlapping awards combine, precedence, trimming, suppression, the 100% ceiling |
| [`src/lib/scholarship/store.tsx`](src/lib/scholarship/store.tsx)     | Application state and every mutation, each of which writes an audit entry                      |
| [`src/lib/scholarship/seed.ts`](src/lib/scholarship/seed.ts)         | Demo data — schools, batches, students, scholarships                                           |

`src/routeTree.gen.ts` is generated by the router plugin. Never edit it by hand.

### Two concepts worth understanding before changing anything

**Precedence is array order.** A scholarship's position in the `scholarships`
array _is_ its priority — index 0 wins first claim on a fee head. This is what
the drag-and-drop page at `/settings/precedence` reorders. When this moves to
Postgres it needs to become an explicit integer column.

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

## Status

The frontend and domain logic are complete. **There is no backend yet.**

All data lives in a React context ([`store.tsx`](src/lib/scholarship/store.tsx))
seeded from [`seed.ts`](src/lib/scholarship/seed.ts) and is **regenerated on every
page refresh** — nothing persists. Building the Postgres backend means:

1. Schema and migrations for the entities in `types.ts`
2. Replacing the store's mutations with TanStack Start server functions
3. Server-side IDs — they are currently generated client-side (`aw-${Date.now()}`)
4. Making batch assign/undo a real database transaction
5. Authentication, so the audit trail records a real actor rather than the
   hard-coded string `"Registrar"`

Zod and TanStack Query are already installed for steps 1–2 and currently unused.
