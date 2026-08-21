# Handover — 20 August 2026

Backend build-out on top of the finished Postgres → Oracle migration, and wiring
the SPA to it. Phases 5 through 10 of the plan in `AGENTS.md`, plus two known
defects fixed first.

**State at handover:** the system runs end to end. React SPA → Laravel API →
Oracle. 221 backend tests pass (was 140 at session start). TypeScript, ESLint on
touched files, Pint, and the production build are all clean.

**The one thing to do before anything else:** `api/` has never been committed.
170 files, plus 26 modified/deleted files in `src/`. Everything below lives
outside git.

---

## 1. Running it

```bash
# Database + API + nginx. The overlay is not optional -- see the trap below.
docker compose -f docker-compose.yml -f docker-compose.verify.yml up -d

# First time only
docker compose exec api composer install
docker compose exec api php artisan key:generate
docker compose exec -e SEED_USER_PASSWORD=changeme api php artisan migrate --seed

docker compose exec api php artisan test        # 221 passing
docker compose exec api ./vendor/bin/pint       # formatting
```

The app is on **http://localhost:8000** (nginx serves `/api` from Laravel and
everything else from `dist/`). `npm run dev` on 8080 proxies `/api` and
`/sanctum` to 8000 so the browser sees one origin either way.

Sign in with the accounts `UserSeeder` creates — one per role,
`registrar.office@bnu.edu.pk`, `scholarship.committee@bnu.edu.pk`,
`finance@bnu.edu.pk`, `admin@bnu.edu.pk`. Passwords are **generated** and
printed once at seed time; set `SEED_USER_PASSWORD` to pin them locally.

---

## 2. Architecture in one page

```
  src/                      React SPA
    lib/api/client.ts       the only fetch wrapper; CSRF, errors
    lib/auth/session.tsx    who is signed in
    lib/scholarship/
      store.tsx             TanStack Query; the only thing that calls the API
      reference.ts          the lookups, from /api/reference
      merge|evaluate|       the pure domain modules, unchanged, still run in
      screening|rates       the browser to draw coverage bars without a round trip
          |
          |  HTTP, same origin, session cookie
          v
  api/
    app/Http/               thin controllers, form requests, DomainJson
    app/Persistence/        loads rows, maps them, calls the domain, writes back
    app/Domain/             PURE. no Eloquent, no queries. enforced by a test.
    app/Models/             22 models + User
```

Dependencies point one way. `app/Domain` does not know `app/Persistence` exists,
and `DomainPurityTest` fails the build if that changes.

**The domain modules exist in both languages on purpose.** They are
transliterations of each other — same order of operations, same float
arithmetic — because the browser needs to compute coverage without a round trip
and Laravel is authoritative on every write. Their two test suites mirror case
for case. Do not "improve" one without the other.

Each layer has a `README.md` next to it (`app/Models/`, `app/Persistence/`,
`app/Http/`). Those are the real documentation; this file is the orientation.

---

## 3. What was done

**Two defects, fixed first.**

- _P6_ — `laravel-oci8`'s `dropAllTables()` called `dropAllPreferences()`
  unguarded, hitting an Oracle Text view that does not exist without the option.
  It failed every feature test at once, but only on the _second_ run, because
  `FreshCommand` only wipes when a `migrations` table already exists. A stub
  view had been applied by hand to `bnu_test` and was in no file. Fixed in app
  code (`app/Database/OraclePreferences.php`), stub dropped, verified by running
  the suite twice.
- _P5_ — Laravel binds timestamps with no offset and Oracle filled the gap from
  the session zone, silently shifting 6 `timestampTz` columns. Pinned the
  session to UTC in `config/database.php`. Reproduced the 5-hour drift first.

**Phase 5** — empty-string convention. The brief said this produces wrong rows;
probing the database showed the opposite for most columns: `NOT NULL` fails
loudly with ORA-01400, and only the **19 nullable** string columns fail
silently. Laravel's default middleware already normalises `'' → null` at the
HTTP boundary, so that convention was adopted and extended to seeders, jobs and
plain assignment via a trait every model inherits.

**Phase 6** — 22 models, casts matching the Oracle types. `ModelSchemaTest`
walks every model and fails if any cast or fillable names a column that does not
exist; `ModelPersistenceTest` proves the casts survive a write and a read.

**Phase 7** — the persistence layer. Mappers, repositories, orchestrators.

**Phase 8** — 36 endpoints, form requests, transactional writers.

**Phase 9** — Sanctum session auth; `roles.ts` is now enforced rather than
described.

**Phase 10** — the SPA wired to all of it.

---

## 4. Settled. Do not re-litigate

- **Oracle 19c is required by BNU IT.** Not open on cost or portability.
- **`docker login container-registry.oracle.com` can never work** — MFA is on,
  and docker login is a single stateless Basic-auth round. Do not retry it.
- **Never run `docker system prune -a`** (destroys the api image, forces a
  rebuild through a pinned oci8 source path that already failed) or
  **`docker compose down -v`** (drops `api-vendor`, the Composer install).
- **`docker-compose.yml` stays pinned to enterprise 19.3.0.0** as the deployment
  target. Local work uses the XE overlay; 18c is older than 19c, so anything it
  accepts, 19c accepts.
- **`server_version => '19c'`** in `config/database.php` pins the _grammar_
  (CLOB for json, NUMBER(1) for boolean) regardless of which server is running.

---

## 5. Four things that change answers, not shapes

These are the non-obvious ones. Each was found by probing rather than reading,
each fails silently, and each has a test that fails if it is undone.

**Rule thresholds lose their type.** `Rule::$threshold` is `string|float|int`
because `types.ts` types it `string | number`; Oracle has no such union so the
column is a `varchar2`. `EvaluationService::passesAutomatic` tests
`is_numeric($t) && ! is_string($t)` — a threshold left as `"3.5"` fails that,
the CGPA comparison never runs, and execution falls through to a branch that
scrapes a number out of the rule's English description or, with no description,
**passes every student**. `ScholarshipMapper::threshold()` hands numeric values
back as numbers. Verified by removing the fix and watching a 3.0-CGPA student
come back Eligible.

**Oracle caps `IN` lists at 1000.** Measured: 1000 fine, 1001 → ORA-01795.
`AGENTS.md` sizes this at 5,000 students, so `whereIn` over a full cohort is a
production error waiting for real data — development seeds 112. Every repository
taking a list of ids goes through `App\Persistence\ChunkedIn`.

**Dates must sort lexicographically.** `ReportService` compares them with
`strcmp` on those grounds. One mapper emitting `2026-8-1` would not throw — it
would sort wrong and misreport scholar counts. Both formats live in
`App\Persistence\DomainDate` and nowhere else.

**JSON `null` breaks the frontend's types.** `types.ts` writes optionals as
`donorName?: string`, which is `string | undefined`, not `string | null`.
`Http\Resources\DomainJson` omits null keys entirely. `0`, `false` and `[]` all
survive; only null is absence.

---

## 6. Traps that cost time

- **The verify overlay is mandatory locally.** Plain `docker compose up` pulls
  enterprise 19.3.0.0, which cannot be pulled (see §4). Always pass
  `-f docker-compose.yml -f docker-compose.verify.yml`.
- **nginx must route `/sanctum`, not just `/api`.** Sanctum's CSRF endpoint sits
  outside `/api`. Before this was fixed, nginx answered it with `index.html` and
  a 200 — so the browser stored no `XSRF-TOKEN` and every write died with a 419
  that looks like a CSRF bug rather than a routing one. Cookie auth cannot work
  without that block in `docker/nginx.conf`.
- **A freshly `create()`d model has nothing for columns with database
  defaults.** Eloquent does not re-read after insert. Mapping one straight to a
  domain object throws a TypeError on the response of a request that already
  committed. `refresh()` first.
- **`role` is deliberately not mass-assignable on `User`.** Assign it
  explicitly. Adding it to `Fillable` would make privilege reachable by any
  future endpoint that fills a `User` from request data.
- **Pest declares top-level functions globally.** Two files defining
  `seedReferences()` is a fatal error, not a shadow. Shared DB fixtures live in
  `tests/Support/rows.php`, autoloaded via `composer.json`.
- **`FormRequest::attributes()` is reserved** by Laravel for validation-message
  attribute names. The camelCase → snake_case translator is called `columns()`.
- **In Oracle a user _is_ a schema.** Test isolation comes from `DB_USERNAME`
  (`bnu` vs `bnu_test`), not `DB_DATABASE` — both connect to the same PDB.

---

## 7. Verified, and not

**Verified.** 221 backend tests. TypeScript clean, production build succeeds,
Pint clean across 132 files. And the real browser flow driven with curl through
nginx: `GET /sanctum/csrf-cookie` → 204 with cookie, `POST /api/auth/login` →
correct role and capabilities, all seven collection endpoints → 200, and a write
the signed-in role may not perform → 403.

**Not verified.** _Nobody has opened the app in a browser._ The store
typechecks and every endpoint it calls answers correctly, but no screen has been
clicked through, no form submitted, no mutation watched round-trip. There are
also **no frontend tests** over `client.ts`, `session.tsx` or the rewritten
`store.tsx` — the Vitest suite still covers only the pure domain modules, which
were not touched. The Vite dev proxy was added and typechecked but never run.

---

## 8. Next, in order

1. **Commit `api/`.** 170 files outside git.
2. **Write a PHP demo seeder.** The database has reference data and 4 users but
   **zero scholarships, students, awards or applications** — sign in works and
   every screen renders blank. `src/lib/scholarship/seed.ts` still holds the
   generator for 112 synthetic students (built arithmetically, so no real person
   is in the repo) and `DatabaseSeeder` names it as the specification for this.
   This is the gap between "wired" and "you can look at it".
3. **Then drive the UI** and confirm the flows, not just their endpoints.
4. **Frontend tests** for the store and API client.
5. **`npm run lint` fails repo-wide on CRLF** — pre-existing, not from this
   work: `.gitattributes` checks files out CRLF while Prettier expects LF. 37
   files. It is a one-line config decision plus a mechanical commit.
6. **The register loads whole.** The store walks the paginated students endpoint
   to the end — ~25 requests at 5,000 students. Fixing it properly means
   server-side search on each list screen, not a change to the store.
7. `seed.ts` keeps its reference constants only because its demo generator needs
   them; `ReferenceDataTest` still holds them and `ReferenceSeeder` together.
   Both go when item 2 lands.

---

## 9. Still unanswered by BNU IT

Everything is verified on 18c XE. That does not prove BNU's 19c agrees.

- **P2 — our own instance, or a schema on theirs?** `RefreshDatabase` drops
  every table it can see, so this decides whether the test suite can exist in
  their environment at all.
- **P3 — is the character set AL32UTF8?** Student names carry Urdu and Punjabi.
  A non-Unicode client character set replaces them with question marks without
  erroring.

_P4 (is Oracle Text installed) is no longer blocking_ — the P6 fix guards both
branches, so it changes nothing either way.
