# Handover — 21 August 2026

Three pieces of work, in the order they were asked for and the order they depend
on each other: the role model was redefined, a demo register of 2,000 students
was generated, and the interface we need from BNU ITRC was written down.

**State at handover:** 258 backend tests pass (was 221 at the start of the
previous session, 223 after the role change). 153 frontend tests pass, TypeScript
is clean, Pint is clean across 158 files, ESLint reports one pre-existing
warning, and the production build succeeds. The dev database holds 2,000
students, 11 scholarships, 624 awards and a 461-application review queue, and
every endpoint answers with them.

**Still true from the last handover:** `api/` has never been committed. That is
now a larger uncommitted surface, not a smaller one.

---

## 1. The role model

BNU named four roles, replacing the four the prototype invented. They are graded
by privilege rather than split by department.

| Role            | Holds                                                                                    | Notes                                                   |
| --------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| **Super Admin** | Everything, plus `users.manage`                                                          | `users.manage` is the only difference from Admin        |
| **Admin**       | applications.read/decide, students.edit, criteria.edit, awards.manage, scholarships.edit | Runs the scholarship cycle end to end                   |
| **Data Entry**  | applications.read, students.edit                                                         | Deliberately cannot decide an application or move money |
| **Reporting**   | applications.read                                                                        | Read-only by construction                               |

The old set — Registrar Office, Scholarship Committee, Finance, Admin — is gone.
`2026_08_20_120000_remap_user_roles` maps existing rows and states each mapping
explicitly rather than doing it by string replacement, because two old roles
collapse into one new one and one gains a capability. It also moves the column
default from `Finance` to `Reporting`, which is still the least a role can hold.

**`users.manage` has no endpoint behind it.** It is declared because it is the
whole distinction between the top two roles, and because a capability in the
matrix becomes enforceable the moment a route names it — so the first user
administration endpoint is written against a gate that already exists rather than
with no gate at all. That is a deliberate choice, not an unfinished one.

Two new tests guard properties the old matrix did not have: every role holds at
least what the role below it holds (the grading is the whole premise of the set),
and `LEAST_PRIVILEGED` really is the smallest set, since it is both the column
default and where an unmapped legacy role lands.

**A parsing bug was fixed while doing this.** `RoleMatrixTest` reads the matrix
out of `roles.ts` with a regex per role name. Unanchored, the pattern for `Admin`
matches inside `"Super Admin":` and reads the wrong role's capability list. Both
sides parsed; only the comparison disagreed. It is anchored to a line start now.

### Files

`src/lib/scholarship/roles.ts`, `types.ts`, `api/app/Auth/RoleMatrix.php`,
`api/app/Http/Actor.php`, the migration, `UserSeeder`, `RoleMatrixTest`,
`AuthTest`, `tests/Support/rows.php`, and prose in four screens that named roles
that no longer exist.

`Actor::DEFAULT` is now `'System'` rather than a role. A seeder or an artisan
command is not the Super Admin and is not Reporting either, and naming one of
them there would have put a role in the audit log that nobody held. It grants
nothing — `RoleMatrix::allows()` denies `'System'` everything.

---

## 2. The demo register

`api/database/seeders/DemoSeeder.php` plus `api/database/seeders/Demo/`. This is
the PHP port `DatabaseSeeder` has been pointing at since the schema landed, and
it is now wired into `migrate --seed`.

```
students               2000
scholarships             11      coverage_lines 13, scholarship_rules 4
eligibility_criteria      1      cgpa_thresholds 2
awards                  624      award_components 633, revocations 45
need_applications       461      documents 1751, decisions 202
domain_events           871      audit_entries 871
```

Thirteen seconds to generate and insert.

### What is different from `seed.ts`

`seed.ts` remains the specification and is still in the tree; nothing reads it.
Four things were done differently, each for a reason that only shows up at scale:

- **Awards follow rules, not array indices.** `seed.ts` granted by position —
  `[2, 'sch-dean'], [3, 'sch-sports']`. Here the Dean's award goes to students
  above the CGPA its own retention rule names, the sports award to students with
  a medal, the need award to students whose need is verified. So filtering the
  register by "CGPA over 3.5" shows the same people the Dean's list does.
- **Dates are spread across terms.** Every award in `seed.ts` started on the same
  day, which is one bar on the dashboard and five empty ones — and is why the
  gained/lost counts there were hardcoded arrays that reconciled with nothing.
  Grants are now dated to a term the student could have been given it in, skewed
  recent, and revocations fall after their grant.
- **Revocations revoke real awards.** `seed.ts` emitted revocation events against
  award ids like `aw-12-hist-3` that were never granted. Here 45 real awards end,
  with a `revocations` row, an event and an audit line each.
- **Approvals point at the award they produced.** The approved pile is drawn from
  students who actually hold a need award granted this term, so
  application → decision → award is a real chain rather than a shape the schema
  allows.

### The distributions are claims, not noise

Each table in `StudentGenerator` is a statement about the university, and the
comment on it says which screen it is for. A uniform spread breaks screens in
specific ways: flat CGPA puts an eighth of every cohort over 3.7 so the Dean's
list shows hundreds; an even batch spread leaves the current intake smaller than
the ones that graduated; a hostel fee on everybody makes the conditional hostel
coverage line indistinguishable from an unconditional one.

The result, measured against the live data: CGPA median 2.84 with 22 students
over 3.7; 1,722 enrolled of 2,000 with all four statuses represented; 690 with a
hostel fee; 9 recorded as Other, which is what makes the inclusion award
reachable. The screening filter blocks on all four automatic criteria (cgpa 119,
income 79, documents 43, duplicate 8) and flags on both advisory ones.

### The one bug worth knowing about

**`Draw::uniform` used `crc32` and it was silently broken.** CRC is affine over
GF(2): for a fixed suffix, `crc32(prefix . suffix)` is a linear map of
`crc32(prefix)` plus a constant that depends only on the suffix. So for any two
salts, `crc32("a:$i") XOR crc32("b:$i")` is the **same value** for every `$i` of
the same digit length — two supposedly independent draws were locked together in
four groups across a 2,000-row run.

The symptom was data, not an error: 2,000 students drew **236 distinct names**
from a possible 1,936, and the three components `bell()` averages moved as one,
narrowing a CGPA range that should have reached 4.00 to a maximum of 3.63. It is
`md5` now, and `DemoDataTest` has the two assertions that would have caught it.

If you take one thing from this file: **do not use `crc32` as a hash for
independent draws.**

### Running it

```bash
docker compose exec -e SEED_USER_PASSWORD=changeme api php artisan migrate:fresh --seed
```

`DEMO_STUDENTS` changes the size. `DemoSeeder` refuses to run in production, and
refuses to add to a register that already holds students unless `DEMO_REPLACE=1`
says to clear the demo tables first. The size is also settable as a property so a
test can ask for 300 without fighting Laravel's env cache.

The whole thing is one transaction. A partial insert is not a smaller demo
database, it is awards pointing at students that were never created.

---

## 3. `api-requirements.md`

At the repository root, written to be handed to BNU ITRC. It asks for six
datasets — student master record, academic standing, fee schedule, reference
lists, attendance, staff directory — field by field, with the type, the format,
whether it is blocking, and what breaks without it.

It is written to be **answered rather than read**: section 9 is nine numbered
decisions only ITRC can make, and an email reply to those nine is enough to start
integrating. The two outstanding Oracle questions (own instance or shared schema;
is the character set `AL32UTF8`) are in an appendix, since the same body answers
them.

Three things in it are worth knowing even if you never send it:

- **We ask for `modifiedSince` on the student endpoint** and say plainly it is
  worth more than any individual field. Without it, staying current means reading
  all 5,000 records every cycle.
- **Section 8 lists five failures that produce a running, wrong system**:
  non-UTF-8 encoding, non-ISO dates, timestamps without an offset, `""` for
  absent, and numbers sent as strings. Every one of them has already bitten this
  codebase at least once.
- **Section 6 asks for a ruling** on whether the SMS should keep letting an
  administrator correct a student record once the CMS is the source. We recommend
  making those fields read-only. It is a real decision and it is theirs.

---

## 4. Traps found this session

- **`crc32` for independent draws.** See above. The most expensive one.
- **`ulid()` compiles to `CHAR(26)`, which blank-pads.** `seed.ts` identifies
  scholarships as `'sch-vc'`. That inserts without complaint and then fails to
  match itself, since CHAR-to-VARCHAR2 comparison does not pad. The slugs stay in
  PHP and every scholarship is issued a real ULID; `ScholarshipCatalogue::ids()`
  is the map.
- **`timestamps()` is `TIMESTAMP`, not `TIMESTAMP WITH TIME ZONE`.** Only the six
  columns declared `timestampTz()` take an offset. Handing `' +00:00'` to
  `created_at` is ORA-01830 — "date format picture ends before converting entire
  input string" — thirteen seconds into a seed. Hence `Row::stamp()` beside
  `Row::timestamp()`.
- **Running artisan as root breaks the web app.** `docker compose exec api php
artisan …` runs as root and creates `storage/logs/laravel.log` owned by root.
  php-fpm runs as www-data, cannot append to it, and **every** API request
  becomes a 500 whose body is the logging failure rather than the real error. Fix:

  ```bash
  docker compose exec api chown -R www-data:www-data storage bootstrap/cache
  ```

- **Sanctum treats a request with no `Origin` as stateless.** A `curl` that omits
  it gets "Route [login] not defined" — the unauthenticated redirect — even with
  a valid session cookie. Always send `-H "Origin: http://localhost:8000"` and
  `-H "Accept: application/json"` when driving the API by hand.
- **`Command::option()` throws for an option the signature does not declare.** A
  `--force-fresh` flag on `db:seed` is not available; `DEMO_REPLACE` is an env
  var for that reason.

---

## 5. Known, and deliberately not fixed

- **The demo data is dated to Fall 2025; today is August 2026.** The reporting
  screen defaults to the current calendar year and finds nothing in it, so it
  opens showing zeros until the range is changed. The fix is not in the seeder —
  the reference lists of intakes and terms stop at Fall 2025 and Spring 2026, and
  those are BNU's data. `api-requirements.md` § D asks for them to be extended
  and flags this as a live gap.
- **Nobody has opened the app in a browser.** Still true, and still the largest
  untested surface. Every endpoint is verified with real HTTP through nginx and
  every screen's data is present, but no form has been submitted by hand.
- **No frontend tests over `store.tsx`, `client.ts` or `session.tsx`.** Vitest
  still covers only the pure domain modules.
- **`npm run lint` fails repo-wide on CRLF.** Pre-existing. Prettier reformatted
  the tables in `README.md` as a side effect of editing it this session, which is
  whitespace-only and visible in the diff.

---

## 6. Next, in order

1. **Commit `api/`.** Unchanged from the last handover and now more urgent.
2. **Open the app in a browser** and drive the flows. The data is there for it
   now, which was the blocker.
3. **Send `api-requirements.md`** and get the nine answers.
4. **Decide the intake and term list** — see § 5. It is a one-line data change
   with a visible effect on the dashboard.
5. **Frontend tests** for the store and API client.
