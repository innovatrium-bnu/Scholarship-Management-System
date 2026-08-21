# -*- coding: utf-8 -*-
# Content for the QA report. Executed inside build_qa_doc.py's namespace.

OUT = r"e:\Internship\Scholarship Management System\qa\QA-Test-Report.docx"

# ============================================================== TITLE PAGE ==
tp = doc.add_paragraph()
tp.paragraph_format.space_before = Pt(70)
tp.paragraph_format.space_after = Pt(0)
r = tp.add_run("BEACONHOUSE NATIONAL UNIVERSITY")
r.font.size = Pt(11)
r.font.bold = True
r.font.color.rgb = MUTED
tp.alignment = WD_ALIGN_PARAGRAPH.CENTER

t1 = doc.add_paragraph()
t1.alignment = WD_ALIGN_PARAGRAPH.CENTER
t1.paragraph_format.space_before = Pt(10)
r = t1.add_run("Scholarship Management System")
r.font.size = Pt(30)
r.font.bold = True
r.font.color.rgb = ACCENT

t2 = doc.add_paragraph()
t2.alignment = WD_ALIGN_PARAGRAPH.CENTER
r = t2.add_run("Quality Assurance Test Report")
r.font.size = Pt(19)
r.font.color.rgb = INK

t3 = doc.add_paragraph()
t3.alignment = WD_ALIGN_PARAGRAPH.CENTER
t3.paragraph_format.space_before = Pt(6)
r = t3.add_run("End-to-end verification of the dashboard, data persistence and requirement completeness")
r.font.size = Pt(10.5)
r.font.italic = True
r.font.color.rgb = MUTED

doc.add_paragraph().paragraph_format.space_after = Pt(24)

info_table(
    [
        ["Document", "QA Test Report — Scholarship Management System"],
        ["Version", "1.1"],
        ["Date prepared", "21 August 2026"],
        ["Build under test", "main @ 21 Aug 2026 (api/ uncommitted — see Section 1.4)"],
        ["Prepared by", "Development team"],
        ["Test type", "Functional, integration, security, persistence, regression"],
        ["Total test cases", "339 across 15 sections"],
        ["Automated suite", "272 backend tests, 153 frontend"],
        ["Defects found and fixed", "4 (DEF-01 to DEF-04) — fixed and regression-tested, see Section 19"],
        ["Status", "Ready for execution"],
    ],
    [5.0, 21.7],
)

page_break()

# ============================================================== 1. PURPOSE ==
doc.add_heading("1.  Purpose and Scope", level=1)

doc.add_heading("1.1  Purpose", level=2)
para(
    "This document defines the manual test procedure for the BNU Scholarship Management System (SMS). "
    "It exists to answer three questions with evidence rather than opinion: does the dashboard work end "
    "to end, does data survive the events that occur in normal operation, and are the agreed requirements "
    "actually complete."
)
para(
    "It is written to be executed. Every test case states concrete steps and a concrete expected result, "
    "and every expected value is taken from a live seeded database rather than estimated. A tester who "
    "sees a different number has found something."
)

doc.add_heading("1.2  Scope", level=2)
para("In scope:", bold=True, space_after=2)
bullets([
    "All 17 application screens and every navigation path between them.",
    "All 36 REST API endpoints, including authorisation and negative cases.",
    "The four-role permission model, tested at both the interface and the server.",
    "The coverage merge, eligibility engine and application screening filter.",
    "Data persistence across refresh, container restart, container removal and re-seed.",
    "Input validation and data integrity, including deliberate malformed input.",
    "Security: session handling, CSRF, authorisation bypass, attribution integrity.",
    "Requirement completeness against the agreed specification.",
])
para("Out of scope:", bold=True, space_after=2)
bullets([
    "Load and stress testing beyond the 2,000-record demo register.",
    "Penetration testing.",
    "Deployment to BNU infrastructure — all testing is against local Docker.",
    "Integration with the BNU CMS, which does not yet exist (see api-requirements.md).",
    "Formal accessibility audit (WCAG conformance), though basic checks are included.",
])

doc.add_heading("1.3  Automated coverage already in place", level=2)
para(
    "The following run in CI and are not repeated as manual cases. Manual testing begins where these stop, "
    "which is at the browser."
)
info_table(
    [
        ["Backend (Pest / PHPUnit)", "272 tests, 887 assertions", "Domain logic, persistence, HTTP layer, roles"],
        ["Frontend (Vitest)", "153 tests", "Pure domain modules only — merge, evaluate, screening, rates"],
        ["Static analysis", "Laravel Pint (158 files), TypeScript strict, ESLint", "Formatting and type safety"],
        ["Build", "Vite production build", "Compiles without error"],
    ],
    [6.0, 7.5, 13.2],
    header=["Suite", "Result at issue", "Covers"],
)
para(
    "Critically, none of the above proves that a screen works. No automated test drives the interface. "
    "That gap is what this document closes.",
    italic=True, color=FAIL,
)

doc.add_heading("1.4  Known limitations of this test cycle", level=2)
bullets([
    "The api/ directory is not yet under version control. Test results cannot be tied to a commit hash.",
    "Demo data is generated, not real. Behaviour with real CMS data is unverified.",
    "The local database is not persistent across container removal. Section 15 covers this in full.",
    "No prior manual test cycle exists. This is the first execution, so a high initial defect count is expected. Four defects were already found and fixed during preparation (Section 19); the cases that found them are now regression tests.",
])

page_break()

# =========================================================== 2. ENVIRONMENT ==
doc.add_heading("2.  Test Environment", level=1)

info_table(
    [
        ["Application URL (dev)", "http://localhost:8080", "Vite dev server, hot reload, proxies /api and /sanctum"],
        ["Application URL (build)", "http://localhost:8000", "nginx serving dist/ — this is what deploys"],
        ["API base", "/api", "36 endpoints, session-authenticated"],
        ["Database", "Oracle XE 18c (container)", "Stands in for BNU's Oracle 19c; 18c is the stricter direction"],
        ["Schema / user", "bnu (dev), bnu_test (tests)", "In Oracle a user is a schema"],
        ["Backend", "Laravel on PHP-FPM", "Container: scholarshipmanagementsystem-api-1"],
        ["Web server", "nginx 1.27-alpine", "Container: scholarshipmanagementsystem-web-1"],
        ["Frontend", "React + TanStack Router/Query", "Built with Vite"],
        ["Session driver", "database", "Sessions are rows in Oracle, not process memory"],
        ["Browsers required", "Chrome, Edge, Firefox", "Chrome is the primary target"],
    ],
    [5.5, 7.0, 14.2],
    header=["Item", "Value", "Notes"],
)

doc.add_heading("2.1  Test accounts", level=2)
para("Created by the seeder, one per role. Password is generated unless SEED_USER_PASSWORD is set.")
info_table(
    [
        ["Super Admin", "super.admin@bnu.edu.pk", "changeme", "All 7 capabilities"],
        ["Admin", "admin@bnu.edu.pk", "changeme", "All except users.manage"],
        ["Data Entry", "data.entry@bnu.edu.pk", "changeme", "applications.read, students.edit"],
        ["Reporting", "reporting@bnu.edu.pk", "changeme", "applications.read only"],
    ],
    [5.0, 8.0, 4.5, 9.2],
    header=["Role", "Email", "Password", "Capabilities"],
)

doc.add_heading("2.2  Environment setup commands", level=2)
info_table(
    [
        ["1", "docker compose -f docker-compose.yml -f docker-compose.verify.yml up -d",
         "The overlay is mandatory. Plain 'up' pulls Oracle Enterprise, which cannot be pulled here."],
        ["2", "docker compose exec api composer install", "First run only."],
        ["3", "docker compose exec api php artisan key:generate", "First run only."],
        ["4", "docker compose exec -e SEED_USER_PASSWORD=changeme api php artisan migrate:fresh --seed",
         "Schema, reference data, 4 accounts, 2,000-student demo register. Approx 30 seconds."],
        ["5", "docker compose exec api chown -R www-data:www-data storage bootstrap/cache",
         "MANDATORY after any artisan command. See DEF/KNOWN-04."],
        ["6", "npm ci && npm run build", "Produces dist/ for the nginx-served build."],
        ["7", "npm run dev", "Dev server on 8080. Leave running."],
    ],
    [1.2, 13.5, 12.0],
    header=["#", "Command", "Purpose"],
)

page_break()

# ============================================================= 3. HOW TO USE ==
doc.add_heading("3.  How to Execute This Report", level=1)

doc.add_heading("3.1  Recording results", level=2)
info_table(
    [
        ["P", "Pass", "Observed result matches the expected result exactly."],
        ["F", "Fail", "Observed result differs. Record what you saw in Notes, and raise a defect."],
        ["B", "Blocked", "Could not run — a prerequisite failed. Name the blocking test ID in Notes."],
        ["N/A", "Not applicable", "Test does not apply to this build. State why."],
    ],
    [2.0, 4.0, 20.7],
    header=["Mark", "Meaning", "When to use"],
)

para(
    "For every failure record: (a) the test ID, (b) what you actually saw, (c) whether it reproduces after "
    "a hard refresh, and (d) a screenshot. Point (c) matters — it separates a stale client cache from a "
    "genuine server-side defect, and the two need entirely different fixes."
)

doc.add_heading("3.2  Execution order", level=2)
para(
    "Run the sections in order. Section 4 (Environment) is a gate: if any case there fails, stop and fix it, "
    "because every later section assumes that state. Sections 5 to 18 may be run by different testers in "
    "parallel provided each uses a separate browser profile. Section 15 (Persistence) contains one "
    "destructive case and must be run last by a single tester."
)

doc.add_heading("3.3  Row shading in the tables", level=2)
info_table(
    [
        ["Red", "A confirmed defect. The expected result describes correct behaviour; the system currently does something else."],
        ["Amber", "A known issue or accepted limitation. Do not raise these as new defects."],
        ["Plain", "Standard test case, outcome not yet known."],
    ],
    [3.5, 23.2],
    header=["Shading", "Meaning"],
    fills=[DEF_FILL, WARN_FILL, None],
)

doc.add_heading("3.4  Reference data — expected values", level=2)
para(
    "The demo generator is deterministic: it contains no call to rand(), and every value derives from a hash "
    "of the row index. Re-seeding therefore reproduces the identical register. These counts are exact, not "
    "approximate, and any deviation is itself a defect."
)
info_table(
    [
        ["students", "2,000", "1,722 Enrolled · 164 Graduated · 59 Withdrawn · 55 On leave"],
        ["scholarships", "11", "10 Active, 1 Archived (Legacy Arts Bursary)"],
        ["coverage_lines", "13", "Includes 1 conditional and 1 fixed-amount line"],
        ["scholarship_rules", "4", "2 cohort-rank award rules, 2 automatic retention rules"],
        ["eligibility_criteria", "1", "Need-Based Scholarship only, with 2 CGPA thresholds"],
        ["awards", "624", "579 Active, 45 Revoked"],
        ["award_components", "633", "Exceeds award count because some awards cover two fee heads"],
        ["revocations", "45", "All four revocation causes represented"],
        ["need_applications", "461", "259 Submitted · 113 Approved · 49 Rejected · 40 On hold"],
        ["application_documents", "1,751", "Four per complete file, one to three on incomplete ones"],
        ["application_decisions", "202", "113 approvals + 49 rejections + 40 holds"],
        ["domain_events", "871", "624 granted + 45 revoked + 202 decided"],
        ["audit_entries", "871", "One per event, phrased as a sentence"],
        ["users", "4", "One per role"],
    ],
    [6.0, 3.5, 17.2],
    header=["Table", "Rows", "Composition"],
)

doc.add_heading("3.5  Stable test anchors", level=2)
para(
    "Registration numbers are reproducible across re-seeds and may be referenced directly. Record IDs "
    "(scholarships, awards, applications) are freshly generated ULIDs on every seed and must be located "
    "through the interface, never pasted from a previous run."
)
info_table(
    [
        ["F25-BSCS-020", "Holds three overlapping awards", "Merge: Need 50% full, Merit 75% trimmed to 50%, External 40% suppressed"],
        ["F25-BBA-069", "Holds three overlapping awards", "Second example of the same ceiling conflict"],
        ["F25-BSPS-001", "Holds three overlapping awards", "Third example"],
        ["F21-BSMC-006", "Gender recorded as Other", "The only students who can reach the Transgender Inclusion Scholarship"],
        ["F21-BAEL-001", "Fall 2021, Enrolled, Lahore", "Safe target for edit tests — holds no awards"],
        ["Legacy Arts Bursary", "The only archived scholarship", "Its awards are all revoked with cause 'Scholarship archived'"],
        ["VC Scholarship", "Precedence 0", "Tuition 100% + hostel full waiver, quota 1 per cohort"],
        ["Externally Funded Need-Based", "Precedence 10 (last)", "The only scholarship permitted to exceed the 100% ceiling"],
    ],
    [7.0, 7.5, 12.2],
    header=["Anchor", "What it is", "Why it matters"],
)

page_break()

# ================================================================ SECTIONS ==
doc.add_heading("4.  Environment and Build Verification", level=1)
section("ENV", "4.1  Stack, seed and toolchain",
        "Gate section. Every later section assumes this state. Stop if any case fails.",
        [
            ("Run `docker compose -f docker-compose.yml -f docker-compose.verify.yml up -d`.",
             "Three containers created and started with no error."),
            ("Run `docker compose ps`.",
             "api, db and web all show status Up. db additionally shows (healthy). web maps 8000->80; db maps 1521."),
            ("Run `docker compose exec api composer install`.",
             "Dependencies install into the api-vendor volume. No permission errors."),
            ("Run `docker compose exec api php artisan key:generate`.",
             "APP_KEY written to api/.env. Command reports success."),
            ("Run `docker compose exec -e SEED_USER_PASSWORD=changeme api php artisan migrate:fresh --seed`.",
             "All 12 migrations run. ReferenceSeeder, UserSeeder and DemoSeeder all complete. DemoSeeder prints a table of row counts."),
            ("Compare the DemoSeeder output against the counts in Section 3.4.",
             "Every figure matches exactly. The generator is deterministic, so these are not approximate."),
            ("Confirm the seeder printed four email addresses.",
             "super.admin@, admin@, data.entry@ and reporting@ at bnu.edu.pk, each with password 'changeme'."),
            ("Run `docker compose exec api chown -R www-data:www-data storage bootstrap/cache`.",
             "Completes silently. Must be repeated after every artisan command.",
             "KNOWN-04"),
            ("Run `npm ci`.",
             "Dependencies install. The prepare script points git at .githooks/."),
            ("Run `npm run build`.",
             "Build succeeds and writes dist/. A chunk-size warning is expected and is not a failure."),
            ("Run `npm run dev`.",
             "Vite reports ready and serves on port 8080."),
            ("Run `docker compose exec api php artisan test`.",
             "258 passed, 841 assertions. No failures, no skipped tests."),
            ("Run `npx vitest run`.",
             "153 passed across 6 test files."),
            ("Run `docker compose exec api ./vendor/bin/pint --test`.",
             "PASS across 158 files."),
            ("Run `npx tsc --noEmit`.",
             "No output. Any type error is a failure."),
            ("Read the terminal running `npm run dev` after loading the app.",
             "Startup banner and page-reload lines only. Any '[Unhandled error]' line is a failure even if the page looks correct.",
             "The blank-page defect announced itself only here"),
        ])

page_break()
doc.add_heading("5.  Smoke Test", level=1)
section("SMK", "5.1  Is it serving at all",
        "Six minutes. Run before every subsequent section on a fresh environment.",
        [
            ("Open http://localhost:8080 and hard-refresh (Ctrl+Shift+R).",
             "The sign-in screen renders. NOT a blank coloured page with a correct tab title.",
             "KNOWN-03: this exact failure has occurred"),
            ("Open http://localhost:8000.",
             "The same sign-in screen, served by nginx from dist/."),
            ("Open browser devtools before loading, then load the page. Read the Console tab.",
             "No uncaught errors and no unhandled promise rejections."),
            ("Read the Network tab on first load.",
             "No 4xx or 5xx responses other than an expected 401 from /api/auth/me before sign-in."),
            ("Run `curl -i http://localhost:8000/sanctum/csrf-cookie`.",
             "HTTP 204 with a Set-Cookie: XSRF-TOKEN header. A 200 returning HTML is a failure."),
            ("Run the same against port 8080 through the dev proxy.",
             "HTTP 204 with the same cookie. Proves the Vite proxy forwards /sanctum, not just /api."),
            ("Run: curl -s -o /dev/null -w \"%{http_code}\" -H \"Accept: application/json\" "
             "-H \"Origin: http://localhost:8000\" http://localhost:8000/api/students",
             "401. A 200 means the register is readable without signing in. A 500 usually means the storage permission issue."),
            ("Check the page title and favicon.",
             "Tab reads 'BNU Scholarships'."),
        ])

page_break()
doc.add_heading("6.  Authentication and Session Management", level=1)
section("AUT", "6.1  Sign-in, sign-out, session lifetime", "",
        [
            ("Sign in as super.admin@bnu.edu.pk / changeme.", "Redirected to the dashboard. Account menu shows 'Super Admin'."),
            ("Sign out, then sign in as admin@bnu.edu.pk.", "Dashboard loads. Account menu shows 'Admin'."),
            ("Sign out, then sign in as data.entry@bnu.edu.pk.", "Dashboard loads. Account menu shows 'Data Entry'."),
            ("Sign out, then sign in as reporting@bnu.edu.pk.", "Dashboard loads. Account menu shows 'Reporting'."),
            ("Attempt sign-in with admin@bnu.edu.pk and a wrong password.",
             "Rejected with HTTP 422 and a generic message. Note the exact wording."),
            ("Attempt sign-in with nobody@bnu.edu.pk and any password.",
             "Rejected with an identical status and identical wording to the previous case. Any difference leaks which addresses exist."),
            ("Submit the sign-in form with an empty email.", "Client-side or server-side validation message. No request reaches the server with an empty email."),
            ("Submit the sign-in form with an empty password.", "Validation message. Form is not submitted."),
            ("Submit an email in an invalid format, e.g. 'not-an-email'.", "Validation message identifying the email field."),
            ("Sign in, then press F5 on a student page.", "Still signed in, same page, data intact."),
            ("Sign in, then close and reopen the browser tab.", "Still signed in — the session cookie persists."),
            ("Sign in, run `docker compose restart api`, wait, then reload.",
             "Still signed in. Sessions are database rows, not process memory."),
            ("Sign out. Then press the browser Back button.", "The sign-in screen. No cached page still showing data."),
            ("After signing out, call /api/auth/me from devtools.", "401 Unauthorized."),
            ("Sign in as Admin in Chrome and as Reporting in Firefox simultaneously. Act in both.",
             "Sessions are independent. Neither affects the other's role or data."),
            ("Signed in, call /api/auth/me and inspect the JSON.",
             "Returns id, name, email, role and capabilities. Must NOT contain 'password' or any hash."),
            ("Attempt a POST to /api/auth/login with no CSRF token.",
             "HTTP 419 (page expired) or 403. Not 200."),
            ("Confirm SESSION_LIFETIME in api/.env.", "480 minutes (8 hours). Record the value; a shorter session is a usability decision, not a defect."),
        ])

page_break()
doc.add_heading("7.  Role-Based Access Control", level=1)
para(
    "The permission model must be verified at two independent layers. The interface hiding a control is "
    "presentation; the server refusing the request is security. A screen that hides a button the API would "
    "allow is a confusing afternoon. A screen that shows one the API refuses is a bug report. Neither "
    "condition raises anything on its own, so both are tested explicitly."
)
doc.add_heading("7.1  Capability matrix under test", level=2)
info_table(
    [
        ["applications.read", "Yes", "Yes", "Yes", "Yes"],
        ["applications.decide", "Yes", "Yes", "No", "No"],
        ["students.edit", "Yes", "Yes", "Yes", "No"],
        ["criteria.edit", "Yes", "Yes", "No", "No"],
        ["awards.manage", "Yes", "Yes", "No", "No"],
        ["scholarships.edit", "Yes", "Yes", "No", "No"],
        ["users.manage", "Yes", "No", "No", "No"],
    ],
    [7.0, 5.0, 5.0, 5.0, 4.7],
    header=["Capability", "Super Admin", "Admin", "Data Entry", "Reporting"],
)

section("RBC", "7.2  Server-side enforcement, per role",
        "Run each case signed in as the stated role. Use devtools fetch() so the request bypasses any "
        "interface control that may be hidden. Expected status is the server's answer, not the screen's.",
        [
            ("As Reporting: POST /api/scholarships with any body.", "403 Forbidden."),
            ("As Reporting: PATCH /api/students/F21-BAEL-001 with {cgpa:3.0, reason:'x'}.", "403 Forbidden."),
            ("As Reporting: POST /api/applications/{id}/decision.", "403 Forbidden."),
            ("As Reporting: POST /api/awards/{id}/revoke.", "403 Forbidden."),
            ("As Reporting: PUT /api/scholarships/{id}/criteria.", "403 Forbidden."),
            ("As Reporting: POST /api/scholarships/{id}/assignments.", "403 Forbidden."),
            ("As Reporting: GET /api/students, /api/awards, /api/audit, /api/events, /api/reports/summary.",
             "All 200. Reads are gated on authentication alone by design. Confirm with the product owner that read-all is intended for this role.",
             "Design decision to confirm"),
            ("As Data Entry: PATCH /api/students/F21-BAEL-001 with {cgpa:3.1, reason:'QA'}.", "200 OK. This role may correct records."),
            ("As Data Entry: POST /api/applications/{id}/decision.", "403 Forbidden."),
            ("As Data Entry: POST /api/applications/reject.", "403 Forbidden."),
            ("As Data Entry: POST /api/awards/{id}/revoke.", "403 Forbidden."),
            ("As Data Entry: PATCH /api/awards/{id}/components.", "403 Forbidden."),
            ("As Data Entry: PUT /api/scholarships/{id}/criteria.", "403 Forbidden."),
            ("As Data Entry: POST /api/scholarships.", "403 Forbidden."),
            ("As Data Entry: POST /api/fee-heads.", "403 Forbidden."),
            ("As Admin: exercise one endpoint from each capability group (scholarships, criteria, awards, applications, students).",
             "All succeed with 200 or 201."),
            ("As Super Admin: repeat the Admin set.", "All succeed identically."),
            ("As Admin and as Super Admin, compare every screen side by side.",
             "Identical, because users.manage has no screen yet. The only difference is the role name in the account menu.",
             "Expected — not a defect"),
            ("Signed out entirely: call each of the 36 endpoints.",
             "All return 401 except POST /api/auth/login. No endpoint returns data."),
        ])

section("RBU", "7.3  Interface-level controls, per role",
        "Confirm the screen agrees with the server. Any disagreement is a defect in one direction or the other.",
        [
            ("As Reporting: open the dashboard, a student profile, the review queue, an application and the criteria page.",
             "Every page reads normally. No Approve, Reject, Revoke, Assign, Edit or Save control is visible anywhere."),
            ("As Reporting: open the Eligibility criteria page.",
             "Fields are read-only and a callout states which roles may edit. The callout must name Admin and Super Admin, not any retired role name."),
            ("As Reporting: open an application detail page.",
             "A callout states the role cannot decide. No Approve or Reject buttons."),
            ("As Data Entry: open a student profile.", "An edit control is available."),
            ("As Data Entry: open an application detail page.",
             "Application content is fully readable. Decide controls absent, replaced by the same callout."),
            ("As Data Entry: open Priority order and Eligibility criteria.", "Readable, not editable. No Save control."),
            ("As Data Entry: open 'Give to students'.", "Either the screen is unavailable, or it is read-only with no Assign control."),
            ("As Admin: confirm every control listed above is present.", "All controls visible and operable."),
            ("As each role in turn, inspect the navigation sidebar.",
             "Navigation does not offer a destination the role cannot use. Record any item that leads to a permission error."),
        ])

page_break()
doc.add_heading("8.  API Endpoint Coverage", level=1)
para(
    "All 36 endpoints. Run signed in as Admin unless stated. Every request must carry "
    "Origin: http://localhost:8000 and Accept: application/json — without an Origin header Sanctum treats "
    "the request as stateless and returns a misleading 'Route [login] not defined' error."
)
section("API", "8.1  Reads", "",
        [
            ("GET /api/reference", "200. Returns schools, programmes, batches, semesters, quotas, geography and fee heads."),
            ("GET /api/scholarships", "200. Exactly 11 items, ordered by precedence ascending, VC Scholarship first."),
            ("GET /api/scholarships/{id}", "200. Full terms including coverage lines and rules."),
            ("GET /api/scholarships/{id}/criteria", "200 for the Need-Based scholarship; a null or empty payload for others."),
            ("GET /api/scholarships/{id}/eligibility", "200. Returns the evaluated candidate list for that scholarship."),
            ("GET /api/criteria", "200. Every scholarship's criteria in one response."),
            ("GET /api/students", "200. meta.total = 2000, meta.perPage = 50, meta.lastPage = 40."),
            ("GET /api/students?per_page=5", "200. Confirm whether perPage is honoured — record the actual value returned.",
             "Observed: perPage stayed 50. Confirm intended."),
            ("GET /api/students/F25-BSCS-020", "200. Full student record in camelCase."),
            ("GET /api/students/F25-BSCS-020/coverage", "200. Three merged awards with mergeStatus Full, Trimmed and Suppressed."),
            ("GET /api/awards", "200. 624 awards."),
            ("GET /api/applications", "200. 461 entries, each carrying application, student, screening and existingCoveragePct."),
            ("GET /api/applications/{id}", "200. One application with documents, household and decision if any."),
            ("GET /api/assignments", "200. Assignment batch history (empty on a fresh seed)."),
            ("GET /api/audit", "200. Audit entries, newest first."),
            ("GET /api/events", "200. 871 domain events, unpaginated."),
            ("GET /api/reports/summary", "200. scholars = 501, totalWaiverPKR = 105295250, bySemester with 6 entries."),
            ("GET /api/auth/me", "200. Role and capabilities for the signed-in user."),
        ])

section("APW", "8.2  Writes", "Each of these mutates data. Re-seed afterwards if you intend to re-run Section 3.4 counts.",
        [
            ("POST /api/auth/login with valid credentials", "200 with user payload."),
            ("POST /api/auth/logout", "204. Subsequent /api/auth/me returns 401."),
            ("POST /api/scholarships with a valid body", "201. New scholarship appears in the list with a precedence."),
            ("PATCH /api/scholarships/{id} changing the name", "200. Change persists and an audit entry is written."),
            ("PUT /api/scholarships/precedence with a reordered list", "200. Order changes. Confirm no duplicate precedence results."),
            ("POST /api/scholarships/{id}/archive with a reason", "200. Status becomes Archived and live awards end with cause 'Scholarship archived'."),
            ("POST /api/scholarships/{id}/restore with a reason", "200. Status returns to Active. Previously ended awards remain ended."),
            ("PUT /api/scholarships/{id}/criteria with a full valid body", "200. Criteria update and the queue re-screens."),
            ("POST /api/scholarships/{id}/assignments with valid picks", "201. Awards created, one assignment batch recorded."),
            ("DELETE /api/assignments/{batch}", "200. Awards from that batch removed; batch marked undone; both halves remain in the log."),
            ("PATCH /api/students/{regNo} with {cgpa, reason}", "200. Value persists; audit entry records old and new values."),
            ("PATCH /api/awards/{id}/components with a valid component set", "200. Components replaced; award marked edited by hand."),
            ("POST /api/awards/{id}/revoke with a valid body", "201. Award status Revoked, revocation row written, event and audit entry created."),
            ("POST /api/applications with a valid application body", "201. Application appears in the queue."),
            ("POST /api/applications/{id}/decision with outcome Approved", "201. Status Approved and an award is created in the same transaction."),
            ("POST /api/applications/{id}/reopen with a reason", "200. Back to Submitted; the award it created is ended with cause 'Application reopened'."),
            ("POST /api/applications/reject with a list of ids and a reason", "200. All named applications become Rejected. One audit entry summarises the batch."),
            ("POST /api/fee-heads with a new name", "201. Fee head available for coverage lines."),
            ("DELETE /api/fee-heads/{name} for an unused fee head", "200 or 204. Confirm a fee head in use cannot be deleted."),
        ])

section("APE", "8.3  Error handling and edge cases", "",
        [
            ("GET /api/students/NOT-A-REAL-REGNO", "404 with a JSON body. Not 500, not an HTML error page."),
            ("GET /api/scholarships/00000000000000000000000000", "404."),
            ("GET /api/applications/{id} with a malformed ULID", "404 or 422. Never 500."),
            ("POST /api/scholarships with an empty body", "422 with a field-by-field error object."),
            ("POST /api/scholarships with studyLevel = 'Undergraduate'", "422 — studyLevel must be Bachelors, Masters or Both."),
            ("POST /api/scholarships with batchMode = 'onwards' and no batchFrom", "422 — batchFrom is required when batchMode is onwards."),
            ("POST /api/scholarships with fundingSource = 'Donor' and no donorName", "422 — donorName is required for donor funding."),
            ("POST /api/scholarships with effectiveFrom = '01/09/2025'", "422 — the format must be Y-m-d."),
            ("POST /api/scholarships with maxDurationYears = 0, then 11", "422 in both cases — range is 1 to 10."),
            ("PATCH /api/students/{regNo} with no reason field", "422 — reason is required on every student edit."),
            ("PATCH /api/students/{regNo} with cgpa = 5.5, then -1", "422 in both cases — range is 0 to 4."),
            ("PATCH /api/students/{regNo} with attendancePct = 150", "422 — range is 0 to 100."),
            ("POST /api/applications/{id}/decision with outcome = 'Maybe'", "422 — outcome must be Approved, Rejected or On hold."),
            ("POST /api/applications/{id}/decision with an empty reason", "422 — reason is required."),
            ("Send a request with Content-Type: text/plain and a JSON body", "415 or 422. Never 500."),
            ("Send deliberately malformed JSON", "400 or 422 with a JSON error body."),
            ("Request an endpoint with an unsupported method, e.g. DELETE /api/students", "405 Method Not Allowed."),
        ])

page_break()
doc.add_heading("9.  Dashboard and Reporting", level=1)
section("DSH", "9.1  Home screen", "Run as Admin against a freshly seeded database.",
        [
            ("Open Home.", "Page renders with populated figures and charts. No empty states."),
            ("Read the scholar count.", "501 — distinct students holding at least one active award."),
            ("Read the total waiver figure.", "PKR 105,295,250."),
            ("Confirm the scholar count is lower than the active award count.",
             "501 scholars against 579 active awards, because students hold more than one."),
            ("Read the awards gained and lost per term series.",
             "Fall 2023 81/0 · Spring 2024 43/25 · Fall 2024 88/2 · Spring 2025 87/4 · Fall 2025 325/14 · Spring 2026 0/0."),
            ("Confirm more than one term carries data.",
             "Five populated terms. A single populated bar would indicate every award shares one date."),
            ("Read the scholars-by-intake-year breakdown.",
             "2021: 3 · 2022: 41 · 2023: 73 · 2024: 97 · 2025: 287."),
            ("Open the reports view without changing the date range.",
             "Figures show zero because the default range is the current calendar year and demo data is dated to Fall 2025.",
             "KNOWN-01 — do not raise"),
            ("Change the reporting date range to cover 2025.", "Figures populate."),
            ("Set an invalid range where 'from' is after 'to'.", "Validation message or an empty result. Never a crash."),
            ("Check every currency figure for formatting.", "Thousands separators present, currency identified, no floating-point artefacts such as 40000.000001."),
            ("Check every percentage figure.", "Values between 0 and 100 with consistent decimal places."),
            ("Resize the window to 1280px, then 768px.", "Charts and figures reflow. No horizontal page scrollbar."),
            ("Click through from a dashboard figure to its underlying list, where such a link exists.", "Navigates to a filtered list consistent with the figure."),
        ])

page_break()
doc.add_heading("10.  Students Module", level=1)
section("STU", "10.1  Register, search and filtering", "",
        [
            ("Open Students.", "The register loads. Record the time to first render and the number of network requests."),
            ("Confirm the total count.", "2,000 students."),
            ("Search by full registration number 'F25-BSCS-020'.", "Exactly one result."),
            ("Search by partial registration number 'F25-BSCS'.", "Multiple results, all from that programme and intake."),
            ("Search by student name.", "Matching students returned. Search is case-insensitive."),
            ("Search for a string that matches nothing.", "An explicit empty state. Not a blank page and not an error."),
            ("Filter by school.", "Only students of that school. Counts consistent with the register."),
            ("Filter by batch.", "Only that intake."),
            ("Filter by enrollment status = Enrolled.", "1,722 students."),
            ("Filter by enrollment status = Graduated.", "164 students."),
            ("Combine a school filter and a batch filter.", "Both applied together, not one replacing the other."),
            ("Clear all filters.", "Full register of 2,000 returns."),
            ("Sort by CGPA descending, if sorting is offered.", "Highest CGPA first. No student above 4.00."),
            ("Page to the last page of results.", "Final page renders with the remainder. No off-by-one gap or duplicate row."),
            ("Check a student's name rendering for non-ASCII characters.", "Characters display correctly. Question marks would indicate a character-set fault."),
        ])

section("STP", "10.2  Student profile", "",
        [
            ("Open F25-BSCS-020.", "Profile renders with every field populated. No 'null', 'undefined' or blank required field."),
            ("Check the date fields.", "dateOfBirth and admissionDate render as real dates, zero-padded, in a consistent format."),
            ("Check the fee figures.", "tuitionFee, hostelFee, messFee and otherFee all present and formatted as currency."),
            ("Check the derived age, if displayed.", "Consistent with dateOfBirth. Age is never stored, only derived."),
            ("Open F21-BSMC-006 (gender Other).", "Renders correctly and shows the Transgender Inclusion Scholarship if held."),
            ("Open a student with enrollment status Graduated.", "Credit hours show 0 — only a student sitting the term has a registered load."),
            ("Open a student with hostelFee 0.", "No hostel coverage line is shown for them."),
            ("Open a student holding no awards.", "An explicit empty state for awards, not a broken panel."),
            ("Open a student with a revoked award.", "Award shows status Revoked with the effective date, term, cause and reason."),
            ("Navigate from a student back to the register.", "Returns to the list with filters and page position preserved, if that is the intended behaviour. Record what happens."),
        ])

section("STE", "10.3  Editing a student", "Run as Admin. F21-BAEL-001 is a safe target — it holds no awards.",
        [
            ("Edit F21-BAEL-001's CGPA to 3.10 with reason 'QA test'. Save.", "Success message. Value updates on screen."),
            ("Hard-refresh the page.", "3.10 persists. A value that reverts was never saved."),
            ("Open the audit trail.", "A new entry names the actor, the field, old value 2.87, new value 3.10 and the reason."),
            ("Attempt to save an edit with an empty reason.", "Rejected. Reason is mandatory on every student edit."),
            ("Attempt to set CGPA to 5.0.", "Rejected with a validation message."),
            ("Attempt to set CGPA to -1.", "Rejected."),
            ("Attempt to set CGPA to 'abc'.", "Rejected."),
            ("Attempt to set attendance to 150.", "Rejected — range is 0 to 100."),
            ("Attempt to set an invalid email format.", "Rejected."),
            ("Set enrollment status to an arbitrary string, e.g. 'Abducted by aliens', via the API.",
             "422 with a validation error on enrollmentStatus. The stored value is unchanged.",
             "FIXED DEF-01 — regression test"),
            ("Set enrollment status to each of Enrolled, On leave, Graduated, Withdrawn.",
             "All four accepted with 200 and stored exactly as sent.",
             "FIXED DEF-01"),
            ("Set enrollment status to 'enrolled' in lower case.",
             "422. The stored value is what every filter matches on, so case matters.",
             "FIXED DEF-01"),
            ("Restore F21-BAEL-001 to its original values.", "Original CGPA 2.87 and status Enrolled restored, each with a reason."),
        ])

page_break()
doc.add_heading("11.  Scholarships Module", level=1)
section("SCH", "11.1  Catalogue and detail", "",
        [
            ("Open All scholarships.", "Ten active scholarships. Legacy Arts Bursary absent — it is archived."),
            ("Confirm the display order.", "Precedence ascending: VC Scholarship first, Externally Funded Need-Based last."),
            ("Open VC Scholarship.",
             "Tuition 100% and a hostel full waiver. Quota 1 per cohort, work-study 8 hours per month, retention rule CGPA >= 3.7."),
            ("Open Talent Award (Fall 2023 intake).", "Batch mode 'list', scoped to Fall 2023 only, tuition 40%."),
            ("Open Talent Award (Fall 2024 onwards).", "Batch mode 'onwards' from Fall 2024, tuition 30%."),
            ("Open Transgender Inclusion Scholarship.",
             "Two coverage lines: tuition 50% percentage, and hostel 20,000 fixed amount conditional on 'Student is not domiciled in Lahore'."),
            ("Open Externally Funded Need-Based.", "Funding source Donor, donor name 'Aslam Foundation', may exceed ceiling set."),
            ("Open Merit-Based Scholarship.", "Cohort-rank award rule at the 18th percentile, semester from Fall 2024, allSemesters false."),
            ("Open Need-Based Scholarship.", "Requires reapplication is set. It is the only scholarship carrying eligibility criteria."),
            ("Open Retired scholarships.", "Exactly one: Legacy Arts Bursary."),
            ("From the archived scholarship, inspect its awards.", "All revoked, cause 'Scholarship archived'."),
        ])

section("SCC", "11.2  Creating and modifying", "",
        [
            ("Create a scholarship with a name, description, study level, batch mode 'all', review cycle, "
             "duration, funding source and one tuition coverage line.",
             "Created. Appears in the list with an assigned precedence."),
            ("Submit the create form with no name.", "Rejected with a field-level message."),
            ("Submit with batch mode 'onwards' and no starting batch.", "Rejected — batchFrom is required."),
            ("Submit with funding source Donor and no donor name.", "Rejected."),
            ("Submit with a duration of 0 years, then 11.", "Rejected in both cases."),
            ("Submit with two coverage lines for the same fee head.", "Rejected — one line per fee head per scholarship."),
            ("Submit with a percentage coverage value of 150.", "Record the outcome. Confirm with the product owner whether above 100 is intentionally permitted at the line level."),
            ("Edit an existing scholarship's description and save.", "Change persists after a hard refresh, and an audit entry is written."),
            ("Assign the new scholarship to a small cohort.", "Awards are created and merge correctly against existing coverage."),
            ("Archive a scholarship with semester = 'not-a-term'.",
             "422 with a validation error on semester. The scholarship stays Active.",
             "FIXED DEF-04 — regression test"),
            ("Archive a scholarship that has active holders, with a reason.",
             "Moves to Retired. Its live awards end with cause 'Scholarship archived'. The audit entry states how many ended."),
            ("Restore the archived scholarship.",
             "Returns to Active. Previously ended awards remain ended — reviving them would reinstate money nobody re-approved."),
            ("Delete a scholarship, if deletion is offered.", "Record the behaviour. A scholarship with awards must not be deletable in a way that orphans them."),
        ])

page_break()
doc.add_heading("12.  Awards and the Coverage Merge", level=1)
para(
    "The merge is the financial core of the system: it decides how overlapping awards combine against a "
    "single fee bill. It runs twice — in PHP for the API and in TypeScript in the browser for immediate "
    "feedback — and the two must agree exactly. These cases are the highest-value tests in this document."
)
section("AWD", "12.1  Merge behaviour", "",
        [
            ("Open F25-BSCS-020 and view the coverage breakdown.",
             "Three awards on tuition: Need-Based 50% applied in full (Full); Merit 75% trimmed to 50% (Trimmed); "
             "Externally Funded 40% applied 0% (Suppressed)."),
            ("Confirm total applied tuition coverage.", "Exactly 100%. Never above."),
            ("Repeat for F25-BBA-069 and F25-BSPS-001.", "The same three-way pattern."),
            ("Compare the on-screen percentages with GET /api/students/F25-BSCS-020/coverage.",
             "Identical values. Any divergence means the browser merge and the server merge disagree — a critical defect."),
            ("Check the rupee amount beside each percentage.", "Equals the percentage applied to that student's tuition fee. Verify one by hand."),
            ("Open a student holding only one award.", "Applied equals entitlement; merge status Full."),
            ("Open a student holding the donor-funded award alongside internal awards.",
             "The donor award may take total coverage above 100% because mayExceedCeiling is set. Confirm this is visibly explained on screen."),
            ("Open F21-BSMC-006 and inspect the hostel line.",
             "The fixed 20,000 hostel amount appears only if the student is not domiciled in Lahore. Otherwise the line is absent."),
            ("Open a student with hostelFee 0 who holds the VC Scholarship.", "The hostel full waiver contributes nothing and must not display a misleading non-zero amount."),
            ("Revoke the highest-precedence award on a multi-award student.",
             "Coverage recomputes immediately: a previously trimmed award now applies in full. Cached values would be a defect."),
            ("Reorder precedence so Merit sits above Need, then reload the student.",
             "The merge outcome changes — Merit now claims tuition first. RESTORE THE ORIGINAL ORDER AFTERWARDS."),
        ])

section("AWM", "12.2  Award management", "",
        [
            ("Revoke an active award with timing 'immediate' and a reason.",
             "201. Status Revoked, with effective date, term, cause and reason recorded."),
            ("Revoke another with timing 'next'.", "Effective date falls at the start of the following term."),
            ("Attempt to revoke with an empty reason.", "422."),
            ("Attempt to revoke with an invalid timing value.", "422 — timing must be 'immediate' or 'next'."),
            ("Attempt to revoke an already-revoked award.", "Rejected, or handled idempotently. Never a duplicate revocation row."),
            ("Send a revoke request with effective = 'not-a-date'.",
             "422 with a validation error on effective. No revocation row is written.",
             "FIXED DEF-02 — regression test"),
            ("Send a revoke request with effective = '2025-02-31'.",
             "422. The shape is right but it is not a day.",
             "FIXED DEF-02"),
            ("Send a revoke request with effective = 'Autumn 2025'.",
             "422. A well-formed label for a term the university does not have would appear in no report.",
             "FIXED DEF-02"),
            ("Send a valid revoke with both forms: effective = 'Fall 2025', then effective = '2025-09-01'.",
             "Both 201, and both store the same effective_from and semester. The endpoint accepts either by design.",
             "FIXED DEF-02"),
            ("Send a revoke request with by = 'Somebody Who Does Not Work Here'.",
             "201. revocations.revoked_by records the SIGNED-IN user, not the supplied string. The extra key is ignored.",
             "FIXED DEF-03 — regression test"),
            ("After that revoke, compare revocations.revoked_by, the event payload actor, and the audit entry actor.",
             "All three name the same signed-in user.",
             "FIXED DEF-03"),
            ("Edit an award's components by hand with a reason.", "Components replaced; award flagged as edited by hand; audit entry written."),
            ("Set an override on a component with an authority and a reason.", "Override displays distinctly from a rules-derived amount."),
            ("Confirm the revocation appears in the event log.", "One award.revoked event with the correct semester."),
            ("Confirm the dashboard scholar count decreases after a revocation.", "Count drops by one if that was the student's only active award."),
        ])

page_break()
doc.add_heading("13.  Applications and Eligibility Screening", level=1)
section("APP", "13.1  Review queue", "",
        [
            ("Open Review applications.", "461 applications total."),
            ("Check each status tab.", "Submitted 259 · Approved 113 · Rejected 49 · On hold 40."),
            ("Confirm the tab counts sum to the total.", "259 + 113 + 49 + 40 = 461."),
            ("Read the screening verdicts across the queue.",
             "Fails criteria 202 · Meets criteria 138 · Needs a closer look 121. All three verdicts appear."),
            ("Filter or sort the queue, where offered.", "Filters apply correctly and counts update."),
            ("Open an application with verdict 'Fails criteria'.", "At least one blocker listed with a specific reason."),
            ("Open an application with verdict 'Needs a closer look'.", "At least one flag, no blockers."),
            ("Open an application with verdict 'Meets criteria'.", "No blockers and no flags."),
            ("Across the queue, confirm each blocker type occurs.",
             "CGPA 119 · income 79 · documents 43 · duplicate 8."),
            ("Confirm each advisory flag occurs.",
             "attendance 171 · existing coverage 52. These flag rather than reject, by design."),
            ("Open an application and read the household declaration.",
             "Income, earning members, dependants, siblings at BNU, guardian occupation and status, residence, rent and vehicle all present."),
            ("Read the personal statement.", "Prose renders fully, not truncated mid-word or escaped."),
            ("Inspect the attached documents.",
             "Named after the student's registration number. Verified status shown per document. Files do not open — there is no storage.",
             "KNOWN-05 — deliberate gap"),
            ("Open an application from a student who already holds the award.", "Flagged as a duplicate. Eight such applications exist."),
        ])

section("APD", "13.2  Deciding an application", "Run as Admin.",
        [
            ("Approve a submitted application at 50% with a reason.",
             "201. Status Approved. A new active award is created for that student in the same transaction."),
            ("Open the approved student's profile.", "The new award is present and merged against any existing coverage."),
            ("Confirm the decision references the award.", "The decision record carries the award id — the provenance chain is complete."),
            ("Reject an application with a reason.", "Status Rejected. Queue counts update."),
            ("Place an application on hold with a reason.", "Status On hold."),
            ("Attempt any decision with an empty reason.", "422 — reason is mandatory."),
            ("Attempt a decision with outcome 'Maybe'.", "422."),
            ("Reopen the approved application.",
             "Status returns to Submitted. The award it created is ended with cause 'Application reopened' — not deleted."),
            ("Confirm both the approval and the reopening remain in the audit trail.", "Both entries present. History is never rewritten."),
            ("Bulk-reject several applications with one reason.",
             "All named applications become Rejected. One audit entry summarises the batch with a count."),
            ("Attempt to decide an already-decided application.", "Rejected, or requires a reopen first. Never silently double-decides."),
            ("Lower the income ceiling in criteria to 60,000 and reload the queue.",
             "More applications now fail on income. Proves the filter reads stored criteria, not a compiled constant. RESTORE 150,000 AFTERWARDS."),
        ])

page_break()
doc.add_heading("14.  Assignment, Settings and Audit", level=1)
section("ASG", "14.1  Batch assignment", "",
        [
            ("Open 'Give to students' and select Merit-Based Scholarship.",
             "Candidate students listed with an eligibility outcome for each."),
            ("Inspect a student ruled ineligible.", "A specific reason is given, traceable to a rule on the scholarship."),
            ("Inspect a student already at the fee ceiling.", "Flagged, so the assigner can see the award would be trimmed or suppressed."),
            ("Assign to a small group with a reason.",
             "Awards created. One audit entry names the scholarship and the number of students."),
            ("Confirm the awards on two of those students.", "Present, active, and merged correctly."),
            ("Confirm the dashboard scholar count rose.", "Increases by the number of students who did not already hold an award."),
            ("Undo the batch.",
             "Those awards are removed from the students. Both the assignment and the undo remain in the log so counts still reconcile."),
            ("Attempt an assignment with no students selected.", "Rejected — at least one pick is required."),
            ("Attempt an assignment with no reason.", "Rejected."),
            ("Attempt to undo the same batch twice.", "Second attempt rejected or handled idempotently. No negative counts."),
        ])

section("SET", "14.2  Criteria and precedence", "",
        [
            ("Open Eligibility criteria.",
             "CGPA 2.50 from Fall 2023 and 2.65 from Fall 2024; income ceiling 150,000; minimum 12 credit hours; "
             "minimum 75% attendance; four required documents; maximum existing coverage 50%."),
            ("Confirm which criteria reject automatically.", "CGPA, income, credit hours, documents and duplicate. Attendance and existing coverage flag only."),
            ("Add a CGPA threshold for a later intake and save.", "Saved. The queue re-screens against it."),
            ("Attempt to add two thresholds for the same intake.", "Rejected — one threshold per intake per scholarship."),
            ("Attempt a negative income ceiling.", "Rejected."),
            ("Attempt a minimum attendance above 100.", "Rejected."),
            ("Remove a required document and save.", "Applications previously failing on documents are re-evaluated."),
            ("Restore all criteria to their seeded values.", "Values as listed in the first case of this section."),
            ("Open Priority order.", "All eleven scholarships listed in precedence order."),
            ("Move one scholarship and save.", "Order persists after a hard refresh. No two scholarships share a precedence."),
            ("Verify the effect on a multi-award student, then restore the original order.",
             "Coverage recomputes with the new order, and returns to the documented values once restored."),
        ])

section("AUD", "14.3  Audit trail and event log", "",
        [
            ("Open the audit trail on a freshly seeded database.", "871 entries."),
            ("Read any entry.", "Names an actor, an action in plain English, and a timestamp."),
            ("Confirm all three action types are present.", "Grants, revocations and application decisions."),
            ("Make a change as Admin, then re-open the audit trail.", "The newest entry names 'Admin' — the signed-in role."),
            ("Repeat while sending a spoofed X-Role header of 'Super Admin'.",
             "The entry still names Admin. The header is ignored and must not be able to sign someone else's name to a change."),
            ("Filter the audit trail by entity or actor, where offered.", "Filters apply correctly."),
            ("Confirm audit entries are append-only.", "No interface offers editing or deletion of an audit entry."),
            ("GET /api/events and count by kind.", "624 award.granted + 45 award.revoked + 202 application.decided = 871."),
            ("Confirm the event count matches the audit count.", "Both 871 on a fresh seed."),
            ("Check that every event carries a semester label.", "Populated for grants, revocations and decisions, enabling per-term reporting."),
        ])

page_break()
doc.add_heading("15.  Persistence and Storage", level=1)
para(
    "The honest position has three parts, and conflating them is how a demonstration is lost on the morning "
    "it matters. Application state survives a browser refresh because nothing of consequence lives in the "
    "browser. The database survives a restart because the container still exists. The database does NOT "
    "survive the container being removed, because the local verification overlay deliberately drops the "
    "db-data volume."
)
para(
    "This was confirmed by inspection: the db container has exactly one mount — the initialisation script — "
    "and /opt/oracle/oradata reports the 'overlay' filesystem, meaning the container's own writable layer. "
    "The db-data volume does exist in `docker volume ls`, created by an earlier non-overlay run, but it is "
    "not attached. That is precisely what makes the trap convincing.",
    italic=True,
)

doc.add_heading("15.1  Survival matrix", level=2)
info_table(
    [
        ["Browser refresh", "Survives", "Survives", "Survives", "Nothing important is client-side"],
        ["docker compose restart", "Survives", "Survives", "Survives", "Verified: healthy again in ~35s"],
        ["docker compose stop / start", "Survives", "Survives", "Survives", "Same container"],
        ["Host reboot", "Survives", "Survives", "Survives", "Containers restart"],
        ["docker compose down", "LOST", "LOST", "Survives", "No volume behind the database"],
        ["docker compose rm -sf db", "LOST", "LOST", "Survives", "Documented reset mechanism"],
        ["docker compose down -v", "LOST", "LOST", "LOST", "FORBIDDEN — also destroys the Composer install"],
        ["docker system prune -a", "LOST", "LOST", "LOST", "FORBIDDEN — destroys the api image"],
    ],
    [6.2, 4.0, 3.6, 4.4, 8.5],
    header=["Action", "Database", "Session", "Vendor / logs", "Notes"],
)

section("PER", "15.2  Persistence test cases",
        "PER-005 is destructive and must be run last. All other cases are safe.",
        [
            ("Make a data change, then hard-refresh the browser.", "The change is present. Nothing of consequence is held in browser memory."),
            ("Open the application in a private window and sign in.", "The same change is visible. State is server-side, not per-browser."),
            ("Clear browser local storage and cookies, then sign in again.", "All data intact. Only the session was in the browser."),
            ("Run `docker compose restart db`, wait for healthy, reload the dashboard.",
             "2,000 students still present. Verified: healthy after approximately 35 seconds."),
            ("While signed in, run `docker compose restart api`, then reload.",
             "Still signed in and all data present. Sessions are Oracle rows, not process memory."),
            ("Run `docker compose stop` then `docker compose start`. Reload.", "All data present."),
            ("Reboot the host machine, bring the stack up with the overlay, reload.", "All data present."),
            ("Run: docker inspect scholarshipmanagementsystem-db-1 --format '{{range .Mounts}}{{.Type}} {{.Name}} -> {{.Destination}}{{println}}{{end}}'",
             "Exactly one mount: the initialisation script bind. No volume at /opt/oracle/oradata.",
             "Confirms the finding non-destructively"),
            ("Run `docker compose exec db df -h /opt/oracle/oradata`.",
             "Filesystem reported as 'overlay' — the container's writable layer, discarded with the container."),
            ("Run `docker volume ls --filter name=scholarship`.",
             "Four volumes listed including db-data. Note that db-data is NOT attached under the overlay."),
            ("Read the db service in docker-compose.yml without the overlay.",
             "db-data:/opt/oracle/oradata is mounted. The production configuration does persist; the gap is local only."),
            ("DESTRUCTIVE — run last. `docker compose down`, bring the stack back up with the overlay, query the student count.",
             "Zero rows or no schema at all. Recover with migrate:fresh --seed, approximately 30 seconds."),
            ("Note three registration numbers and the dashboard figures. Re-seed. Compare.",
             "Identical registration numbers, names, counts, scholar total and waiver total. Record IDs differ — they are freshly generated ULIDs."),
            ("With data present, run `php artisan db:seed --class=DemoSeeder`.",
             "Declines with a message that the register already holds students. Counts unchanged."),
            ("Repeat with DEMO_REPLACE=1 set.", "Clears the demo tables first, then re-seeds. Reference data and user accounts are preserved."),
            ("Confirm the team knows the two forbidden commands.",
             "`docker compose down -v` and `docker system prune -a` are never run against this project."),
        ])

page_break()
doc.add_heading("16.  Security", level=1)
section("SEC", "16.1  Access control, session and data protection", "",
        [
            ("Sign out, then request every one of the 36 API endpoints.", "All return 401 except POST /api/auth/login. No data is disclosed."),
            ("Copy a session cookie from one browser into another and issue a request.",
             "Record the behaviour. Session fixation protections should apply."),
            ("Sign in, capture the session cookie, sign out, then replay the cookie.", "401. The session is invalidated server-side, not only client-side."),
            ("Inspect the session cookie attributes.", "HttpOnly set. SameSite set. Secure must be set in any production deployment."),
            ("Submit a state-changing request without an X-XSRF-TOKEN header.", "419 or 403. Never 200."),
            ("Submit a state-changing request with a wrong CSRF token.", "419 or 403."),
            ("As Reporting, attempt every write endpoint via devtools fetch().", "All 403. Section 7.2 covers this per endpoint."),
            ("Attempt to escalate by sending {\"role\":\"Super Admin\"} to any endpoint accepting a user payload.",
             "Ignored. The role field is deliberately not mass-assignable."),
            ("Send a spoofed X-Role header on a write, then check the audit trail.", "The header is ignored; the audit records the real signed-in role."),
            ("Send a revoke request with a client-supplied 'by' value.",
             "The recorded revoker is the signed-in user. Client-supplied identity is ignored on every write path.",
             "FIXED DEF-03 — regression test"),
            ("Enter <script>alert(1)</script> into a student name, a reason and a personal statement. Save and re-open.",
             "Rendered as literal text, never executed. React escapes by default — confirm no dangerouslySetInnerHTML path exists."),
            ("Enter a SQL fragment such as ' OR 1=1 -- into a search field.", "Treated as a literal search string. No error and no unexpected results."),
            ("Request a student record belonging to no scope restriction the role should have.",
             "Confirm with the product owner whether any role should be scoped to a subset of students. Currently all roles read all students."),
            ("Check API responses for over-disclosure.", "No password hashes, no internal exception traces, no stack traces in any response."),
            ("Force an error and read the response body.", "A generic message. APP_DEBUG must be false in any deployed environment."),
            ("Check that the login endpoint is rate-limited.",
             "Repeated failed attempts are throttled. Record the threshold. If unthrottled, raise as a defect."),
            ("Confirm the API is not reachable over plain HTTP in a deployed environment.", "Not testable locally. Record as an item for the deployment checklist."),
            ("Review api/.env for secrets committed to version control.", "No production credentials present. .env must be git-ignored."),
        ])

page_break()
doc.add_heading("17.  Performance and Scale", level=1)
section("PRF", "17.1  Response times and volume", "Record actual measurements, not impressions. These are baselines for later comparison.",
        [
            ("Time the first load of the Students register with an empty cache.",
             "Record seconds and the number of network requests. The register loads whole — roughly 40 requests at 2,000 students.",
             "KNOWN-06"),
            ("Time the dashboard load.", "Record. Should be under 3 seconds on a local stack."),
            ("Time GET /api/applications.", "Record. The response is approximately 1.6 MB and unpaginated."),
            ("Time GET /api/events.", "Record. 871 events, unpaginated by design."),
            ("Time a student profile with three overlapping awards.", "Record. The merge runs on read in both PHP and the browser."),
            ("Filter and search the register repeatedly.", "Interaction stays responsive; filtering is in memory after the initial load."),
            ("Assign a scholarship to the largest available cohort.", "Completes without timeout. Record the count and the elapsed time."),
            ("Re-seed at DEMO_STUDENTS=5000 and repeat the register load.",
             "Record. This is the expected production scale and the point at which the load-whole strategy may need replacing."),
        ])

doc.add_heading("18.  Browser, Responsive and Accessibility", level=1)
section("UIX", "18.1  Cross-cutting interface checks", "",
        [
            ("Run the smoke test in Chrome, Edge and Firefox.", "Identical behaviour in all three."),
            ("Resize to 1920, 1440, 1280, 1024 and 768 pixels wide.", "Layout reflows at each. No horizontal page scrollbar at any width."),
            ("Check wide tables at 1024px.", "Tables scroll within their own container, not by moving the whole page."),
            ("Navigate the sign-in form using only the keyboard.", "All fields reachable by Tab. Focus is visible at every step. Enter submits."),
            ("Navigate the main application using only the keyboard.", "All interactive controls reachable and operable. Focus never becomes trapped."),
            ("Check colour contrast on body text, muted text and status pills.", "Meets WCAG AA (4.5:1 for body text). Record any failure with the measured ratio."),
            ("Confirm status is not conveyed by colour alone.", "Every status carries a text label as well as a colour."),
            ("Trigger a validation error and check it is announced.", "The error is associated with its field and reachable by a screen reader."),
            ("Check every image and icon for alternative text.", "Meaningful images have alt text; decorative ones are hidden from assistive technology."),
            ("Zoom the browser to 200%.", "Content remains usable and nothing is clipped."),
            ("Check loading states on every screen.", "A loading indicator appears rather than a blank region or a flash of empty state."),
            ("Disconnect the network mid-session and attempt an action.", "A clear error message. No silent failure and no infinite spinner."),
            ("Check every empty state.", "Explanatory text, not a blank panel."),
            ("Check the browser Back and Forward buttons across several screens.", "Navigation history behaves correctly and state is not lost."),
        ])

page_break()
# ================================================================= DEFECTS ==
doc.add_heading("19.  Defects Found and Fixed", level=1)
para(
    "Four defects were found while preparing this report, by probing validation rules rather than by "
    "running the automated suite — which was fully green while all four were live. All four have been "
    "fixed and each now has a regression test. The cases that found them are marked FIXED in the sections "
    "above and shaded green; re-run those first."
)
para(
    "They are four instances of two mistakes: a closed set validated as a free string (DEF-01, DEF-02, "
    "DEF-04), and an identity taken from the client instead of the session (DEF-03). Both patterns are "
    "worth carrying into any future endpoint review.",
    italic=True,
)

info_table(
    [
        ["DEF-01", "High", "Fixed",
         "Student enrollment status accepted any string",
         "PATCH /api/students/{regNo} validated enrollmentStatus as ['sometimes','string'] with no Rule::in and no CHECK constraint.",
         "Sent {\"enrollmentStatus\":\"Abducted by aliens\"}. Returned 200 and stored it. The row then belonged to no status: absent from every filter, counted in no report, and invisible to the enrolled check that gates an award.",
         "New App\\Domain\\Support\\EnrollmentStatus holds the four values and is checked against the TypeScript union by EnrollmentStatusTest. The endpoint now validates with Rule::in. Verified live: 422."],
        ["DEF-02", "Medium", "Fixed",
         "Malformed revocation date returned 500 instead of 422",
         "POST /api/awards/{id}/revoke validated 'effective' as ['required','string']. The field legitimately accepts either a term label or a date, but nothing checked it was one of the two.",
         "Sent {\"effective\":\"not-a-date-at-all\"}. Returned 500 with Carbon InvalidFormatException. The transaction rolled back, so no row was written, but the caller received a server fault instead of a message naming the field.",
         "New App\\Http\\Rules\\TermOrDate accepts an ISO date whose calendar is real, or a term that exists in the semesters table. Verified live: 422."],
        ["DEF-03", "High", "Fixed",
         "Revocation attribution was client-supplied and forgeable",
         "The same endpoint accepted a 'by' field written verbatim to revocations.revoked_by rather than derived from the session.",
         "Sent {\"by\":\"Somebody Who Does Not Work Here\"} as Admin. Returned 201 and stored the supplied string, while audit_entries.actor correctly recorded Admin. Two records of one event disagreed about who caused it, and the forgeable one was the financial record.",
         "'by' is no longer read; the field was removed from AwardWriter::revoke entirely so no caller can supply one. revoked_by is Actor::from($request), the same value the event and audit line carry. The client no longer sends it. Verified live: stored value is the session user."],
        ["DEF-04", "Medium", "Fixed",
         "Malformed archive term returned 500 instead of 422",
         "POST /api/scholarships/{id}/archive validated 'semester' as ['required','string'] — the same defect as DEF-02, found by following the pattern.",
         "Sent {\"semester\":\"not-a-term\"}. Returned 500. Rolled back correctly, so the scholarship stayed Active and its awards were untouched.",
         "Same TermOrDate rule applied. Verified live: 422."],
    ],
    [1.9, 1.5, 1.5, 4.2, 4.6, 6.5, 6.5],
    header=["ID", "Severity", "Status", "Title", "Cause", "Evidence at discovery", "Fix and verification"],
    fills=[FIX_FILL] * 4,
)

para(
    "Scope note: these were found by probing, not by a systematic security review. The pattern behind three "
    "of the four may occur in endpoints not yet exercised. Sections 8.3, 10.3 and 11.2 are written to find "
    "the rest, and any new endpoint should be read with the same two questions in mind.",
    italic=True,
)

doc.add_heading("20.  Known Issues — Do Not Raise", level=1)
para("These are understood, accepted, or belong to another party. They must not be logged as new defects.")
info_table(
    [
        ["KNOWN-01", "Reports open showing zero", "The default date range is the current calendar year; demo data is dated Fall 2025 because the reference term list stops at Spring 2026.", "Move the range to 2025. The real fix needs BNU's extended intake and term lists, not a code change."],
        ["KNOWN-02", "curl returns 'Route [login] not defined'", "No Origin header, so Sanctum treats the request as stateless.", "Send Origin and Accept: application/json on every manual API call."],
        ["KNOWN-03", "Blank page on port 8080 with an empty console", "Tag-like text in the HTML comment above <html> captured Vite's script-injection point.", "Fixed on 21 Aug 2026. If it recurs, keep opening tags out of that comment."],
        ["KNOWN-04", "Every API call returns 500 mentioning laravel.log", "artisan run as root leaves a root-owned log file that php-fpm cannot append to.", "docker compose exec api chown -R www-data:www-data storage bootstrap/cache"],
        ["KNOWN-05", "Document links do not open", "There is no file storage. Documents are metadata only, and the storage column is deliberately absent rather than nullable.", "Deliberate gap. Arrives with its own migration."],
        ["KNOWN-06", "Students register is slow on first load", "List screens filter in memory, so the store walks the paginated endpoint to the end.", "Known. The fix is server-side search per screen, not a store change."],
        ["KNOWN-07", "Super Admin looks identical to Admin", "users.manage has no screen or endpoint yet.", "Expected. The capability is declared so the first such endpoint is written against an existing gate."],
        ["KNOWN-08", "npm run lint fails across the repository", "Line endings — .gitattributes checks files out CRLF while Prettier expects LF.", "Pre-existing. One configuration decision plus a mechanical commit."],
        ["KNOWN-09", "Local database lost on docker compose down", "The verification overlay deliberately drops the db-data volume; the XE database is baked into the image and is meant to be disposable.", "By design locally. Production compose mounts db-data. Section 15 covers it."],
    ],
    [2.4, 5.6, 9.0, 9.7],
    header=["ID", "Symptom", "Cause", "Disposition"],
    fills=[WARN_FILL] * 9,
)

page_break()
# ============================================== 21. REQUIREMENTS COMPLETENESS ==
doc.add_heading("21.  Requirement Completeness", level=1)
para(
    "'Complete' needs three separate answers, because a gap that was chosen is a different kind of thing "
    "from a gap that was missed. Nothing in the second or third table below is a defect and none of it "
    "should be raised as one."
)

doc.add_heading("21.1  Built and covered", level=2)
info_table(
    [
        ["Scholarship catalogue and terms", "Complete", "SCH-001 to SCH-023", "11 seeded, exercising every scoping mode"],
        ["Coverage merge and 100% ceiling", "Complete", "AWD-001 to AWD-011", "Two mirrored test suites, PHP and TypeScript"],
        ["Eligibility engine", "Complete", "ASG-001 to ASG-010", "Automatic, manual, cohort-rank and calculated-score rules"],
        ["Need-based applications", "Complete", "APP-001 to APD-012", "461 seeded; all six criteria exercised"],
        ["Awards, revocation, provenance", "Complete", "AWM-001 to AWM-011", "624 awards, 45 revocations, all four causes"],
        ["Audit trail and event log", "Complete", "AUD-001 to AUD-010", "871 of each, reconciling"],
        ["Role-based access control", "Complete", "RBC/RBU", "Gates generated from the matrix; matrix checked against roles.ts"],
        ["Session authentication", "Complete", "AUT-001 to AUT-018", "Cookie flow verified through nginx"],
        ["Reference data", "Complete", "API-001", "Schools, programmes, intakes, terms, quotas, geography, fee heads"],
        ["Oracle 19c schema", "Complete", "ENV-005", "Verified against 18c XE, which is the stricter direction"],
        ["Reporting layer", "Complete", "DSH-001 to DSH-014", "Scholars, waiver totals, per-term series, intake breakdown"],
    ],
    [7.0, 3.0, 6.0, 10.7],
    header=["Requirement area", "Status", "Test IDs", "Evidence"],
)

doc.add_heading("21.2  Deliberate gaps — chosen, not missed", level=2)
info_table(
    [
        ["File upload for application documents", "Metadata only. The storage column is absent rather than nullable so nothing half-works. Arrives with its own migration and its own decision about where files live."],
        ["User administration screen", "users.manage is declared and gated; no endpoint exists. Accounts come from the seeder."],
        ["Financial Coverage module", "Per-component coverage lines versioned by intake year. In the wider specification, not this build."],
        ["Sponsor Body module", "External funders. Intended to share the merge engine rather than duplicate it."],
        ["Invoice module", "Fee minus coverage, per term."],
        ["Excel / PDF / print export", "Planned as one shared service rather than per-screen."],
        ["Student CRUD screen and lookup administration", "Fields exist and display; the management screens do not. Likely to become read-only once the CMS is the source of student data."],
        ["Server-side search on list screens", "Lists filter in memory, so the register loads whole. The fix is per-screen search, not a change to the store."],
    ],
    [8.0, 18.7],
    header=["Absent", "Why"],
)

doc.add_heading("21.3  Blocked on another party", level=2)
info_table(
    [
        ["Real student data", "BNU ITRC — see api-requirements.md", "System runs on 2,000 generated students"],
        ["Intake and term lists beyond Fall 2025", "BNU", "Reporting opens on an empty date range (KNOWN-01)"],
        ["Dedicated Oracle instance or a shared schema", "BNU IT", "Determines whether the automated test suite can run in their environment at all"],
        ["Confirmation that the character set is AL32UTF8", "BNU IT", "A non-Unicode character set would silently destroy Urdu and Punjabi names"],
        ["Staff sign-in method (SSO, directory, or local)", "BNU ITRC", "Local accounts only"],
        ["Fee schedule definition — per semester or per year, gross or net", "BNU ITRC", "Every currency figure in the system depends on the answer"],
    ],
    [8.5, 8.0, 10.2],
    header=["Item", "Waiting on", "Effect until answered"],
)

doc.add_heading("21.4  Not verified by anyone", level=2)
bullets([
    "This document. Until it is executed, no screen in this system has been operated by a person — all "
    "verification to date has been automated tests or direct HTTP calls.",
    "Frontend integration tests. Vitest covers the pure domain modules only; the store, API client and "
    "session provider have no tests.",
    "Behaviour at production scale. 2,000 students is the demo; roughly 5,000 is expected.",
    "Deployment to BNU infrastructure. All testing so far is local Docker.",
    "Formal accessibility conformance and cross-browser certification.",
    "Behaviour with real CMS data, including names, fee structures and status values not present in the "
    "generated register.",
])

page_break()
# ================================================================= SIGN-OFF ==
doc.add_heading("22.  Execution Summary and Sign-off", level=1)

doc.add_heading("22.1  Results by section", level=2)
info_table(
    [
        ["4", "Environment and Build", "16", "", "", "", ""],
        ["5", "Smoke Test", "8", "", "", "", ""],
        ["6", "Authentication and Session", "18", "", "", "", ""],
        ["7", "Role-Based Access Control", "28", "", "", "", ""],
        ["8", "API Endpoint Coverage", "54", "", "", "", ""],
        ["9", "Dashboard and Reporting", "14", "", "", "", ""],
        ["10", "Students Module", "38", "", "", "", ""],
        ["11", "Scholarships Module", "24", "", "", "", ""],
        ["12", "Awards and Coverage Merge", "26", "", "", "", ""],
        ["13", "Applications and Screening", "26", "", "", "", ""],
        ["14", "Assignment, Settings, Audit", "31", "", "", "", ""],
        ["15", "Persistence and Storage", "16", "", "", "", ""],
        ["16", "Security", "18", "", "", "", ""],
        ["17", "Performance and Scale", "8", "", "", "", ""],
        ["18", "Browser and Accessibility", "14", "", "", "", ""],
        ["", "TOTAL", "339", "", "", "", ""],
    ],
    [1.5, 8.0, 2.5, 2.2, 2.2, 2.2, 8.1],
    header=["§", "Section", "Cases", "Pass", "Fail", "Blocked", "Comments"],
)

doc.add_heading("22.2  Exit criteria", level=2)
para("The build is accepted for release to the next environment when all of the following hold:")
bullets([
    "Every case in Sections 4 and 5 passes. These are gates.",
    "No open defect of severity High. DEF-01 and DEF-03 were High and are fixed; this criterion is currently met.",
    "Every case in Section 7 (access control) and Section 16 (security) passes.",
    "Section 15 has been executed in full and the persistence position is understood and documented by the team.",
    "Fewer than 5% of all cases marked Fail, and every failure either fixed or accepted in writing.",
    "No case left Blocked.",
])

doc.add_heading("22.3  Sign-off", level=2)
info_table(
    [
        ["Tester", "", "", "", ""],
        ["Reviewer", "", "", "", ""],
        ["Project lead", "", "", "", ""],
        ["Accepted for release", "", "", "", ""],
    ],
    [5.0, 6.5, 5.0, 4.5, 5.7],
    header=["Role", "Name", "Signature", "Date", "Comments"],
)

doc.add_heading("22.4  Document history", level=2)
info_table(
    [
        ["1.0", "21 Aug 2026", "Development team", "Initial issue. 333 cases across 15 sections. Three confirmed defects included at issue."],
        ["1.1", "21 Aug 2026", "Development team", "DEF-04 added. All four defects fixed and regression-tested; their cases converted to regression checks. Backend suite 258 to 272 tests."],
    ],
    [2.5, 4.5, 6.0, 13.7],
    header=["Version", "Date", "Author", "Change"],
)
