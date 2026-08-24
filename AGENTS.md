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

**1b. The same logic now exists twice, and both copies must agree.**

Each of those modules — plus [`aggregate.ts`](src/lib/scholarship/aggregate.ts)
— has a PHP counterpart in [`api/app/Domain/`](api/app/Domain/). Laravel is
authoritative: it recomputes every figure on write, and a client-supplied amount
is input, never authority. The TypeScript copies stay because the browser draws
coverage bars and ceiling warnings without a round trip.

| TypeScript     | PHP                 |
| -------------- | ------------------- |
| `merge.ts`     | `MergeService`      |
| `evaluate.ts`  | `EvaluationService` |
| `rates.ts`     | `RatePlanService`   |
| `screening.ts` | `ScreeningService`  |
| `aggregate.ts` | `ReportService`     |
| `funds.ts`     | `FundService`       |

**Change one, change the other, and change both test suites.** Every one of the
132 Vitest cases in those five modules is mirrored in Pest under
[`api/tests/Unit/`](api/tests/Unit/), keeping the original test names so a
failure points at its counterpart. If the two implementations drift, a registrar
sees one number on screen and the invoice says another.

Two things make the PHP port reproduce the TypeScript exactly, and both look
like mistakes if you do not know why:

- **Floats, not BCMath.** Every number in TypeScript is an IEEE-754 double and
  so is a PHP float. Decimal arithmetic here would be arguably more correct and
  demonstrably different, which is the one outcome that cannot be allowed. The
  database columns are `decimal`; the services are not.
- **[`JsNumber::text()`](api/app/Domain/Support/JsNumber.php) instead of a
  string cast.** Reason strings are compared character for character, and PHP's
  float-to-string honours the `precision` ini setting while JavaScript always
  emits the shortest round-tripping form.

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
- **Routes are files** in [`src/routes/`](src/routes/). This is TanStack Router,
  not Next.js — no `src/pages/`, no `app/layout.tsx`. See
  [src/routes/README.md](src/routes/README.md) for the naming table.
- **This is a SPA.** There is no server rendering and no Node process in
  production. `src/main.tsx` mounts the router into `index.html`; the backend is
  Laravel, reached over HTTP. Do not add server-side rendering or reintroduce
  TanStack Start.
- **`src/routeTree.gen.ts` is generated.** Never edit it by hand.
- **`@/` resolves to `src/`.**
- **Formatting**: Prettier — 100 columns, double quotes, semicolons, trailing
  commas. Run `npm run format`; do not hand-format around it.
- **UI components** in [`src/components/ui/`](src/components/ui/) are shadcn/ui
  and are owned by this repo. Edit them directly when needed.
- **The build config is deliberately explicit.** [`vite.config.ts`](vite.config.ts)
  spells out every plugin rather than delegating to a wrapper package, so the
  university owns its own build. Keep it that way.
- **The empty string does not exist in the database.** Oracle stores `''` as
  NULL and cannot be configured otherwise, so this application never writes one.
  Laravel's default `ConvertEmptyStringsToNull` middleware covers request input;
  everything else — seeders, jobs, factories, plain assignment — is covered by
  `App\Models\Concerns\NormalisesEmptyStrings`, which every model inherits from
  `App\Models\Model` (`User` applies it by hand, since it must extend
  `Authenticatable`). Two consequences when writing PHP: compare against `null`,
  never `''`, and expect a NOT NULL column handed `''` to fail loudly with
  ORA-01400 rather than store anything. The 19 nullable string columns are the
  ones that would otherwise fail silently, because `where col = ''` matches no
  row in Oracle — not even one you just wrote.

## Current state

The system is complete end to end. **There is a backend**: a Laravel API on
Oracle in [`api/`](api/), and the SPA talks to it.
[`store.tsx`](src/lib/scholarship/store.tsx) is TanStack Query over `fetch`
rather than a React context, so data persists across a refresh, and every screen
sits behind a session the server enforces.

How the pieces fit:

- **[`api/`](api/)** is Laravel on Oracle. `app/Domain/` holds the ported money
  and eligibility services and is **pure** — no Eloquent, no queries, enforced
  by `DomainPurityTest`. `app/Persistence/` loads rows, maps them to those
  services and writes results. `app/Http/` is thin controllers over that.
- **[`src/`](src/)** is the SPA. `store.tsx` is the only thing that talks to the
  API; screens read it exactly as they read the old in-memory context.
- **The pure domain modules exist in both languages on purpose.** The browser
  runs the TypeScript copy to draw coverage bars and ceiling warnings without a
  round trip; Laravel is authoritative on every write. They are
  transliterations of each other and the two test suites mirror case for case.

Everything the in-memory store used to fudge is now real, and each of these is
worth knowing because the reasoning is still load-bearing:

- **IDs come from the database.** ULIDs, not `aw-${Date.now()}`. The audit one
  used to collide after an undo.
- **Precedence is an integer column** with a `DEFERRABLE INITIALLY DEFERRED`
  unique constraint, so a reorder can pass through a duplicate state inside its
  transaction. Any endpoint returning scholarships orders by it, because the
  browser runs its own merge and takes the order it is given.
- **Batch assign/undo and approve-creates-award are single transactions.**
- **`roles.ts` is enforced.** `App\Auth\RoleMatrix` mirrors it capability for
  capability and is registered as gates; `RoleMatrixTest` parses `roles.ts` and
  fails if they drift. The audit actor is the signed-in user, and the `X-Role`
  header the SPA used to send is ignored.
- **`evaluate()`, `computeMerge()` and `screen()` still take whole collections
  in memory, and must keep doing so.** The persistence layer loads the working
  set in bulk — `AwardRepository::activeForStudents`, `ApplicationScreener` at
  four queries for the whole queue — precisely so these stay pure. Do not push a
  query into them.
- **Donor money is accounting, and never entitlement.** The donors module
  records what was promised, what arrived, and which award each rupee paid for.
  It does not change what any student is charged: `MergeService` must never
  consult `FundService`, and no allocation may alter a coverage percentage. The
  browser runs its own copy of the merge with no fund data at all, so a
  dependency in that direction would make the server and the screen compute
  different money — the exact failure §1b exists to prevent.
- **The three fund states are derived, never stored.** Pledged, Received
  (unassigned) and Received (assigned) are amounts rather than row statuses,
  because one receipt can be part allocated and would have to sit in two
  buckets at once. A status column would need maintaining by every receipt and
  every allocation, and would drift. Same call as screening verdicts: what a
  person decided is stored, what those decisions add up to is computed.
- **Two guards hold the donors module to the rest of the system.** Assigning
  more than a receipt holds is refused under a row lock, because no CHECK can
  express "the sum of my children must not exceed my column" on Oracle. And
  `undoBatch` — the one operation that hard-deletes awards — refuses a batch
  whose awards carry donor money, rather than surfacing ORA-02292 from a
  feature with no visible connection to donors.
- **Documents on an application are still metadata only**; there is no file
  storage, and the storage column is absent rather than nullable so nothing
  half-works.

## Not built yet

The Registrar Office's wider specification covers modules this repo does not
have. Anything here is a deliberate gap, not an oversight:

Financial Coverage (per-component coverage lines versioned by intake year),
Invoice (fee minus coverage, per term), and Report (Excel/PDF/print as one
shared service). Student information is partly built:
the fields exist on `Student` and display on the profile, but the CRUD screen
and the admin-managed lookup tables for quota and domicile do not.
