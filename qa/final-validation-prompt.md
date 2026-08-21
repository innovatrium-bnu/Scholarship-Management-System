# Final validation prompt

Everything below the horizontal rule is the prompt. Paste it into a fresh session
opened at the repository root. It is written to be self-contained — a session
with no prior context can work from it alone.

---

# Final system validation — BNU Scholarship Management System

You are the last quality gate before this system is delivered to the client. Your
job is to **find what is broken**. A report concluding that everything works is
the least useful outcome of this exercise, and will be read as a failure of the
review rather than a success of the system.

Work through the phases in order. Do not skip ahead — each one depends on the
last being true.

---

## 0. The standard you are held to

Read this before anything else. It is the reason this review exists.

**A green test suite is not evidence that the system works.** In this project,
272 backend tests and 153 frontend tests passed green at the same moment that:

- the development server served a **blank page** to every visitor, and had done
  since it was created;
- `PATCH /api/students/{regNo}` accepted **any string** as an enrollment status
  and stored it, putting the row outside every filter and every report;
- the award revocation endpoint let a client **forge who ended someone's
  funding**, while the audit trail recorded the real actor — two records of one
  event, disagreeing, with the forgeable one being the financial record;
- two endpoints returned **HTTP 500 on ordinary bad input** instead of a
  validation message.

None of those raised anything. Every one was found by a person deliberately
trying to break something.

So the rules for this review are:

1. **Every claim needs evidence.** Paste the command and the output you saw. A
   finding without a reproduction is a rumour.
2. **Never infer behaviour you did not observe.** If you tested an API and not a
   screen, say you tested an API. `curl` does not execute JavaScript — proving an
   endpoint answers proves nothing about the page that calls it. That exact
   mistake is how the blank page survived.
3. **"Should work", "appears correct", "looks fine" are not results.** Either you
   exercised it and saw what happened, or you did not.
4. **Report a clean area with your method.** "Section 4: no issues" is worthless.
   "Section 4: exercised these 12 requests, saw these responses, no issues" is a
   finding.
5. **Unverified is a valid and valuable answer.** List everything you could not
   check and why. An honest gap is far more useful than a false assurance.

---

## 1. What you are testing

A scholarship management system for Beaconhouse National University: a
scholarship catalogue, an award ledger, a need-based application queue with an
eligibility filter, a four-role permission model, an audit trail and a reporting
layer.

| Layer       | Where                           | Notes                                                        |
| ----------- | ------------------------------- | ------------------------------------------------------------ |
| Backend     | `api/`                          | Laravel on Oracle. 36 REST endpoints.                        |
| Domain      | `api/app/Domain/`               | Pure — no Eloquent, no queries. Enforced by a test.          |
| Persistence | `api/app/Persistence/`          | Loads rows, maps them, calls the domain, writes back.        |
| Frontend    | `src/`                          | React, TanStack Router and Query.                            |
| Data access | `src/lib/scholarship/store.tsx` | The only thing that calls the API.                           |
| Database    | Oracle XE 18c locally           | BNU runs 19c. 18c is older, so what it accepts, 19c accepts. |

**The domain logic exists in both PHP and TypeScript on purpose.** The browser
runs the TypeScript copy of the merge, eligibility and screening rules so a
screen can render without a round trip; Laravel is authoritative on every write.
They are transliterations of each other. **A divergence between them is a
critical defect and neither side will raise it** — that is one of the highest
value things you can go looking for.

Read `README.md`, `AGENTS.md`, and the newest file in `handover/` before you
start. They carry reasoning that is not in the code.

---

## 2. Getting it running

```bash
docker compose -f docker-compose.yml -f docker-compose.verify.yml up -d
docker compose exec api composer install                      # first run only
docker compose exec api php artisan key:generate              # first run only
docker compose exec -e SEED_USER_PASSWORD=changeme api php artisan migrate:fresh --seed
docker compose exec api chown -R www-data:www-data storage bootstrap/cache
npm ci && npm run build
npm run dev
```

- **http://localhost:8080** — dev server, hot reload.
- **http://localhost:8000** — nginx serving the production build. **This is what
  deploys.** Test both. They inject scripts differently and one can work while
  the other is broken.

Four accounts, one per role, password `changeme`:
`super.admin@bnu.edu.pk`, `admin@bnu.edu.pk`, `data.entry@bnu.edu.pk`,
`reporting@bnu.edu.pk`.

### Rules you must not break

- **Never `docker compose down -v`** — destroys `api-vendor`, the Composer
  install.
- **Never `docker system prune -a`** — destroys the api image, forcing a rebuild
  through a pinned oci8 source path that has already failed once.
- **Never attempt `docker login container-registry.oracle.com`** — MFA is on and
  docker login is a single stateless Basic-auth round with no slot for a second
  factor. It cannot work. Do not retry it or reset the password.
- **The compose overlay is mandatory** — plain `docker compose up` pulls Oracle
  Enterprise, which cannot be pulled here.
- Re-seeding is cheap (~20s) and safe. Use it freely to return to a known state.

### Three traps that will cost you an hour each

| Symptom                                             | Cause                                                              | Fix                                                                                         |
| --------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Every API call returns 500 mentioning `laravel.log` | `artisan` run as root leaves a root-owned log php-fpm cannot write | Re-run the `chown` above                                                                    |
| `curl` returns "Route [login] not defined"          | No `Origin` header, so Sanctum treats the request as stateless     | Send `Origin: http://localhost:8000` and `Accept: application/json` on every manual call    |
| A page is blank with an empty browser console       | Check the terminal running `npm run dev`                           | That is the only place the last such defect announced itself, and it named an innocent file |

---

## 3. The expected baseline

The demo generator is deterministic — no `rand()` anywhere — so these are exact,
not approximate. **Confirm them before testing anything else. A deviation is
itself a defect and invalidates everything downstream.**

| Table                | Rows  |     | Table                 | Rows  |
| -------------------- | ----- | --- | --------------------- | ----- |
| students             | 2,000 |     | awards                | 624   |
| scholarships         | 11    |     | award_components      | 633   |
| coverage_lines       | 13    |     | revocations           | 45    |
| scholarship_rules    | 4     |     | need_applications     | 461   |
| eligibility_criteria | 1     |     | application_documents | 1,751 |
| cgpa_thresholds      | 2     |     | application_decisions | 202   |
| domain_events        | 871   |     | audit_entries         | 871   |

- Students: 1,722 Enrolled · 164 Graduated · 59 Withdrawn · 55 On leave
- Applications: 259 Submitted · 113 Approved · 49 Rejected · 40 On hold
- Screening verdicts: 202 fail · 138 meet · 121 need a closer look
- Screening blockers: cgpa 119 · income 79 · documents 43 · duplicate 8
- Dashboard: **501 scholars**, **PKR 105,295,250** total waiver
- Awards per term: Fall 2023 81/0 · Spring 2024 43/25 · Fall 2024 88/2 ·
  Spring 2025 87/4 · Fall 2025 325/14

Registration numbers are reproducible across re-seeds. Record IDs are freshly
generated ULIDs and are not — find them through the interface, never paste one
from an earlier run.

**Anchors:** `F25-BSCS-020`, `F25-BBA-069` and `F25-BSPS-001` each hold three
overlapping awards (Need 50% full, Merit 75% trimmed to 50%, External 40%
suppressed — total exactly 100%). `F21-BSMC-006` has gender Other.
`F21-BAEL-001` holds no awards and is a safe edit target.

---

## 4. How to work: five phases

### Phase 1 — Establish the ground truth (30 min)

Bring the stack up. Confirm every count in section 3. Run the automated suites
and record the actual numbers. Load both URLs and confirm a page renders.

**Stop and report immediately if any count is wrong.** Everything after this
assumes this state.

### Phase 2 — Read for defects before running anything (60 min)

Cheaper than testing, and it tells you where to aim. Read with two questions in
mind, because they are the two mistakes this codebase has actually made:

> **Is a closed set being validated as a free string?**
> **Is an identity or authority being taken from the client instead of the session?**

Read every `rules()` array in `api/app/Http/Requests/`, every inline
`$request->validate([...])` in `api/app/Http/Controllers/Api/`, and every field
each controller passes onward. Write down each suspicion as a hypothesis with the
request that would prove it.

Then prove or disprove each one with an actual request. A suspicion you did not
test does not belong in the report.

### Phase 3 — Exercise every path (bulk of the work)

Work through the areas in section 5. For each, do the happy path first, then
attack it.

### Phase 4 — Attack the seams

The places where two things meet, which is where this project's defects have
lived:

- PHP domain vs TypeScript domain — do they compute the same money?
- Screen vs server — does the interface agree with what the API permits?
- Dev build vs production build — do both actually run?
- Transaction boundaries — does a failure halfway leave a half-written state?
- Client input vs server-derived truth — can a client claim to be someone else?

### Phase 5 — Write the report (section 7)

---

## 5. Areas to cover

### 5.1 Backend and API

- All 36 endpoints. Get the list:
  `docker compose exec api php artisan route:list --path=api`
- For each: happy path, 401 unauthenticated, 404 unknown id, 422 malformed
  payload, 405 wrong method.
- Every gated route tested from devtools `fetch()`, so you bypass any hidden UI
  control and see what the **server** does.
- Transactions: approve-creates-award, batch assign, batch undo,
  archive-ends-awards. Confirm nothing is half-written on failure.
- Error bodies: no stack traces, no internal paths, no password hashes.

### 5.2 Frontend

- All 17 routes in `src/routes/`, signed in and signed out.
- All four roles. **The screen and the server must agree.** A screen hiding a
  control the API allows is one defect; a screen showing one the API refuses is
  another. Both are silent.
- Forms: empty required fields, out-of-range numbers, wrong formats, very long
  strings, `<script>` tags, unicode, leading and trailing whitespace.
- Loading, empty and error states on every screen.
- Browser console clean throughout, and the Vite terminal clean too.

### 5.3 Connections

- `GET /sanctum/csrf-cookie` must return **204 with a cookie** on both ports. A
  200 returning HTML means nginx is answering it and cookie auth is structurally
  broken.
- Sessions across refresh, container restart, sign-out, and two browsers at once.
- The dev proxy forwards both `/api` and `/sanctum`.
- **Compare `GET /api/students/F25-BSCS-020/coverage` against what the screen
  renders for that student.** They must match exactly — this is the PHP/TypeScript
  divergence check and it is the single highest-value test in this list.

### 5.4 Database and persistence

- Referential integrity: no award, component, application or decision pointing at
  a row that does not exist.
- Oracle hazards, all of which fail silently:
  - `''` is stored as `NULL`.
  - `IN` lists are capped at 1000 expressions (ORA-01795) — anything taking a
    list of ids must chunk. Test with more than 1000.
  - Dates must sort lexicographically (`YYYY-MM-DD`, zero-padded); report code
    compares them as strings.
  - Rule thresholds live in a `varchar2`. One returned as a **string** silently
    skips the CGPA comparison and passes every student.
  - `ORDER BY` on a CLOB (any `text` column) raises ORA-00932.
- Persistence: what survives a refresh, a restart, and container removal. Under
  the local overlay the database is **not** on a volume — verify by inspection
  (`docker inspect`, `df -h /opt/oracle/oradata`) rather than by running
  `docker compose down`.

### 5.5 Security

- Every endpoint refuses an unauthenticated caller.
- Role escalation: can any role reach a capability it does not hold?
- CSRF enforced on state-changing requests.
- Client-supplied identity ignored everywhere — spoofed headers, extra payload
  fields, injected role values.
- XSS through any free-text field that is later rendered.
- Login throttling. Record the threshold; if there is none, that is a finding.

### 5.6 Client requirements

Verify each is genuinely met, not merely present:

- Scholarship catalogue with terms, coverage and rules. Never versioned — changed
  terms mean a second scholarship scoped to later intakes.
- Overlapping awards merge against a **100% fee ceiling** by precedence, with
  trimming and suppression. One donor-funded scholarship may exceed it.
- Need-based applications with documents, household declaration, and an
  eligibility filter whose criteria are **editable data, not compiled constants**.
- Awards, revocation with cause and effective term, and provenance from
  application → decision → award.
- Batch assignment and undo.
- Audit trail a person reads, plus a machine-countable event log. Both
  append-only.
- Four roles enforced server-side: Super Admin, Admin, Data Entry, Reporting.
- Reporting: scholars, waiver totals, per-term gained/lost, intake breakdown.

---

## 6. What is already known

### Fixed — verify the fix holds, then look for others of the same kind

Four defects were found and fixed on 21 Aug 2026. Confirm each fix, then treat
the two underlying patterns as your search template.

| ID     | Was                                                             | Now expected                                                         |
| ------ | --------------------------------------------------------------- | -------------------------------------------------------------------- |
| DEF-01 | `enrollmentStatus` accepted any string, returned 200, stored it | 422 for anything outside Enrolled / On leave / Graduated / Withdrawn |
| DEF-02 | Revoke with a non-date `effective` returned 500                 | 422; accepts a real ISO date or a known term label                   |
| DEF-03 | Revoke accepted a client `by` and stored it as the revoker      | Revoker is the signed-in user; a supplied `by` is ignored            |
| DEF-04 | Archive with an unknown `semester` returned 500                 | 422, same rule as DEF-02                                             |

**Finding only these four means you have not looked hard enough.** Three of them
are the same mistake in different places.

### Not defects — do not report these

| Symptom                                           | Why                                                                                                                                    |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Reports open showing zero                         | Default range is the current calendar year; demo data is dated Fall 2025 because BNU's term list stops at Spring 2026. Move the range. |
| Document links do not open                        | No file storage. Documents are metadata only, deliberately.                                                                            |
| Students register slow on first load              | Lists filter in memory, so the register loads whole (~40 requests). Known; fix is server-side search.                                  |
| Super Admin looks identical to Admin              | `users.manage` has no screen yet. Deliberate.                                                                                          |
| `npm run lint` fails repo-wide                    | Pre-existing CRLF/LF configuration mismatch.                                                                                           |
| Database lost after `docker compose down`         | The local overlay deliberately drops the `db-data` volume. Production compose mounts it.                                               |
| One `react-refresh` ESLint warning in `store.tsx` | Pre-existing and harmless.                                                                                                             |

Deliberately absent, and **not** defects: file upload, user administration
screens, the Financial Coverage / Sponsor Body / Invoice / Export modules,
server-side search, student CRUD screens.

### Where defects are most likely — spend your time here

Ranked by this project's actual history:

1. **Input validation** — four for four so far.
2. **Identity and authority on writes** — anywhere a client can supply a name, a
   role, or an actor.
3. **PHP/TypeScript divergence** in merge, eligibility and screening.
4. **Transaction boundaries** — partial writes when something fails midway.
5. **Merge edge cases** — zero fees, exactly 100%, suppressed lines, conditional
   lines, the may-exceed-ceiling scholarship.
6. **State transitions** — decide an already-decided application, revoke a
   revoked award, undo an undone batch, archive an archived scholarship.
7. **Empty and boundary data** — a student with no awards, a scholarship with no
   holders, an application with no documents.
8. **Concurrency** — two tabs editing the same record.

---

## 7. What to deliver

A written report with these sections, in this order:

1. **Verdict, in the first line.** Deliverable, not deliverable, or deliverable
   with named caveats. Say it plainly before anything else.
2. **Defects found.** For each: severity, exact reproduction steps, observed vs
   expected, evidence, and the impact on the client in plain language.
3. **Status of DEF-01 to DEF-04.** Fix holds, or regressed.
4. **Coverage.** What you exercised, area by area, with your method. Include the
   areas where you found nothing.
5. **Not verified.** Exhaustive. Everything you could not check and why.
6. **Requirements.** Met, partially met or not met, item by item against 5.6.
7. **Recommendation.** What must be fixed before delivery, and what can follow.

### Two things about how you work

- **If browser automation is available, use it** to drive the interface. If it is
  not, say so explicitly and list which checks that made impossible. Do not infer
  screen behaviour from API responses.
- **Do not fix anything unless asked.** Find and report first — a fix midway
  changes the thing you are measuring.

### Existing material

`qa/QA-Test-Report.docx` holds 339 structured test cases with exact expected
values. **Use it as a floor, not a ceiling.** It was written by the same person
who wrote the code, so it inherits their blind spots — which is the main reason a
fresh pair of eyes is doing this.

---

**Begin with Phase 1.** Bring the system up and confirm the baseline counts in
section 3. If they do not match, stop and report that before doing anything else.
