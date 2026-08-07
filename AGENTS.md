# Working in this repository

Guidance for AI agents and new contributors. Setup, commands, and deployment
live in [README.md](README.md) — this file covers what is easy to get wrong.

## Non-negotiables

**1. The money logic is tested. Keep it that way.**

Four pure modules decide things a student feels in their pocket:
[`merge.ts`](src/lib/scholarship/merge.ts) decides how much fee relief each
student actually receives,
[`evaluate.ts`](src/lib/scholarship/evaluate.ts) decides who qualifies for an
award, [`screening.ts`](src/lib/scholarship/screening.ts) decides which
need-based applications are turned down without a person reading them, and
[`rates.ts`](src/lib/scholarship/rates.ts) decides what percentage of each fee a
batch assignment pays, per student. All four are covered by tests (`npm test`).

If you change how awards merge, how eligibility is judged, what the criteria
filter rejects, or how a rate plan resolves, **those tests should fail**. If they
still pass, your change was not covered — add a case before shipping it. A silent
error here means a student is charged the wrong amount or refused help they
qualified for, and nobody finds out for a semester.

`assign` must keep reading `rates.ts` for every figure it shows and every award
component it writes. The version before it had one rate for the whole batch and
resolved it in two places, so the ceiling check used the chosen rate while the
"afterwards" column still showed the scholarship's — the two disagreed on screen
and nothing caught it.

**1a. The criteria filter sorts; it never decides.**

`screen()` returns a verdict and nothing else. Turning an application down is
always an explicit action a person takes in the UI, recorded with a reason —
never a side effect of a render. Keep it that way: an automatic rejection that
nobody pressed a button for is one nobody can defend on appeal.

Screening verdicts are derived on every read, so editing a threshold re-sorts
the queue immediately. Decisions, by contrast, are stored — once a person has
ruled, moving a threshold must not rewrite what they decided.

**2. Precedence is array order.**

A scholarship's index in the `scholarships` array _is_ its priority — index 0
gets first claim on a fee head, and later ones are trimmed or suppressed against
whatever headroom is left. This is what the drag-and-drop page at
`/settings/precedence` reorders. Never reorder that array as a side effect of
something else (sorting for display, filtering, deduplicating) — copy it first.

**3. Nothing is versioned, and nothing is hard-deleted.**

A scholarship has one set of terms for life. If the terms change for a newer
intake, that is a _new_ scholarship scoped to those batches via `batchMode` /
`batchFrom` — do not add a version field. Likewise, scholarships are archived
rather than deleted, reversibly, because an awarded scholarship is part of a
student's financial record. `/scholarships/delete` is a redirect stub kept only
for old bookmarks.

The one exception is `undoBatch`, which deletes the awards it created. That is
deliberate: an undone mis-click is not something a student ever held, and it
should not sit on their record as a scholarship that was taken away from them.
The history is not lost — the grant and the undo are both on the event log.

**3a. Policy numbers live in data, not in code.**

The CGPA floors, income ceiling, document list and the set of criteria that
reject automatically are all rows in `EligibilityCriteria`, edited at
`/settings/criteria`. When the policy changes, nobody should have to ship a
release. Do not inline a threshold in a component or a rule in `screen()`.

**4. Every mutation writes an audit entry and an event.**

Each action in [`store.tsx`](src/lib/scholarship/store.tsx) goes through the
`record()` helper, which appends to both logs at once. New mutations must do the
same, with a reason where a human made a judgement call.

The two logs are not redundant. [`AuditEntry`](src/lib/scholarship/types.ts)
answers _"who changed this record and why"_ for one entity, and `AuditPanel`
renders its `action` sentence to a person.
[`DomainEvent`](src/lib/scholarship/events.ts) answers _"how many, when"_ across
the whole system and is only read by code — so every field on it is
machine-readable and nothing is interpolated into prose.

That distinction exists because it was got wrong once: `revokeAward` used to
record the term an award ended by writing `Revoked (immediate, from Fall 2025)`
into the audit sentence and nowhere else, which made "how many students lost a
scholarship last semester" answerable only by regexing English. **Never put a
value a report needs into a sentence.** If something must be counted later, it
is a field on an event.

**4a. Numbers on screen come from tested functions.**

Dashboard figures and reports read
[`aggregate.ts`](src/lib/scholarship/aggregate.ts), not inline `useMemo`
arithmetic in a route. Two bugs lived in those inline blocks for exactly as long
as nothing could test them: "taken back this year" counted the date an award
_started_, and the scholars-over-time chart used `BATCHES.find`, silently
dropping every Fall cohort. Never seed a figure that reconciles with nothing —
`seedGainedLostBySemester()` returned two invented arrays and was rendered as
though measured, which is why it is gone.

## Conventions

- **npm only.** The lockfile is npm's and versions are pinned exactly. Do not
  introduce bun, pnpm, or yarn, and do not loosen pinned versions to ranges.
- **Routes are files** in [`src/routes/`](src/routes/). This is TanStack Start,
  not Next.js — no `src/pages/`, no `app/layout.tsx`. See
  [src/routes/README.md](src/routes/README.md) for the naming table.
- **`src/routeTree.gen.ts` is generated.** Never edit it by hand.
- **`@/` resolves to `src/`.**
- **Formatting**: Prettier — 100 columns, double quotes, semicolons, trailing
  commas. Run `npm run format`; do not hand-format around it.
- **UI components** in [`src/components/ui/`](src/components/ui/) are shadcn/ui
  and are owned by this repo. Edit them directly when needed.
- **The build config is deliberately explicit.** [`vite.config.ts`](vite.config.ts)
  spells out every plugin rather than delegating to a wrapper package, so the
  university owns its own build. Keep it that way.

## Current state

The frontend and domain logic are complete. **There is no backend.** All data
lives in a React context seeded from
[`seed.ts`](src/lib/scholarship/seed.ts) and is regenerated on every page
refresh — nothing persists.

The next major piece of work is a PostgreSQL backend, deployed on BNU servers.
Zod and TanStack Query are already installed for that and currently unused.

When that lands, watch for these, which are artefacts of the in-memory store:

- IDs are generated client-side (`aw-${Date.now()}`, `au-${audit.length + 1}`)
  and must become database-generated. The audit one collides after an undo.
- Precedence needs to become an explicit integer column, not array position.
- Batch assign and undo must become a single database transaction.
- Approving an application creates its award in the same state update. That has
  to stay atomic in SQL too, or a student ends up approved but holding nothing.
- The audit actor is whichever `Role` is picked in the top bar. There is no
  authentication: [`roles.ts`](src/lib/scholarship/roles.ts) describes what each
  role may do but cannot enforce it. When auth lands, `can()` should read the
  session instead of the picked role, and the screens need no change.
- `evaluate()`, `computeMerge()` and `screen()` take whole collections in
  memory. Load the working set in bulk queries and keep these functions pure —
  do not make them query per student, or the dashboard becomes an N+1 disaster
  at 5,000 students. `useScreenedApplications()` runs `computeMerge` once per
  application and is the first thing that will need batching.
- Documents on an application are metadata only; there is no file storage yet.

## Not built yet

The Registrar Office's wider specification covers modules this repo does not
have. Anything here is a deliberate gap, not an oversight:

Financial Coverage (per-component coverage lines versioned by intake year),
Sponsor Body (external funders, sharing the 100%-cap merge engine rather than
duplicating it), Invoice (fee minus coverage, per term), and Report
(Excel/PDF/print as one shared service). Student information is partly built:
the fields exist on `Student` and display on the profile, but the CRUD screen
and the admin-managed lookup tables for quota and domicile do not.
