# API requirements — Scholarship Management System

**To:** BNU IT Resource Centre
**From:** the Scholarship Management System (SMS) project
**Status:** request for interface specification
**Last updated:** 21 August 2026

---

## 1. What this document is

The SMS is built and running. It holds a scholarship catalogue, an award ledger,
a need-based application queue with an eligibility filter, an audit trail and a
reporting layer, and it runs against Oracle. What it does not have is a single
real student.

Everything about a student — who they are, what they are enrolled in, what their
CGPA is, what they owe — belongs to the BNU CMS. The SMS is not a second
register and must never become one. It needs to read that data, and it needs to
read it through an interface rather than a nightly spreadsheet.

This document says exactly what we need, in the shape we need it, so that ITRC
can specify and expose the endpoints. It is written to be answered rather than
read: **section 9 is a numbered list of decisions only ITRC can make**, and a
reply to those nine points is enough for us to start integrating.

Until those endpoints exist the SMS runs on 2,000 generated students. They are
built arithmetically from name-part lists and contain no real person. They are a
demonstration, not a migration, and every one of them is discarded on the day
real data arrives.

### What we are asking for, in one line each

| #   | Dataset               | Why we need it                                                    | Priority     |
| --- | --------------------- | ----------------------------------------------------------------- | ------------ |
| A   | Student master record | Every screen in the system is about a student                     | **Blocking** |
| B   | Academic standing     | CGPA and credit hours are what eligibility is decided on          | **Blocking** |
| C   | Fee schedule          | An award is a percentage of a fee; with no fee there is no amount | **Blocking** |
| D   | Reference lists       | Schools, programmes, intakes, terms, quotas                       | **Blocking** |
| E   | Attendance            | One eligibility criterion, currently advisory                     | Important    |
| F   | Staff directory / SSO | Who may sign in to the SMS and as what                            | Important    |

---

## 2. The system in one paragraph

A scholarship has terms — what it covers, who it is open to, and the rules for
keeping it. A student may hold several at once, so the system computes how they
combine against one fee bill: the higher-precedence award claims tuition first,
the next is trimmed to what is left, and anything past 100% is suppressed unless
the scholarship is explicitly permitted to exceed it. Need-based awards go
through an application with documents, a household declaration and an
eligibility filter. Every grant, revocation and decision is recorded twice —
once in an audit trail a person reads, once in an event log the reports count.

None of that requires the SMS to own student data. It requires the SMS to be
able to ask about a student and get a reliable answer.

---

## 3. What we need, field by field

Field names below are ours. We do not expect the CMS to use them; we expect a
mapping. What matters is that each one is **available**, and that its **type and
format** are what we state or can be converted to it without ambiguity.

"Blocking" means a screen is wrong or a calculation cannot run without it.

### A. Student master record

One record per student, keyed by registration number.

| Our field          | Type   | Format / values                                     | Need         | What it drives                                                                                                            |
| ------------------ | ------ | --------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `regNo`            | string | e.g. `F23-BSCS-014`                                 | Blocking     | Primary key. Appears on every award and application                                                                       |
| `name`             | string | Unicode, full name as printed                       | Blocking     | Every list and every document                                                                                             |
| `fatherName`       | string | Unicode                                             | Blocking     | Shown on the application; used to identify by hand                                                                        |
| `dateOfBirth`      | date   | `YYYY-MM-DD`                                        | Blocking     | Age is derived from it and never stored separately                                                                        |
| `gender`           | enum   | `Male` / `Female` / `Other`                         | Blocking     | One scholarship is scoped by it                                                                                           |
| `email`            | string | address                                             | Blocking     | The only contact channel we use                                                                                           |
| `phone`            | string | any, we do not parse it                             | Important    | Contacting an applicant about a missing document                                                                          |
| `school`           | string | must match the school list, § D                     | Blocking     | Cohort ranking, scholarship scope, every report                                                                           |
| `programme`        | string | must match the programme list, § D                  | Blocking     | Scholarship scope, study level                                                                                            |
| `studyLevel`       | enum   | `Bachelors` / `Masters`                             | Blocking     | Scholarships are scoped by level                                                                                          |
| `batch`            | string | intake label, e.g. `Fall 2023`                      | Blocking     | Cohort ranking and the CGPA threshold ladder                                                                              |
| `admissionDate`    | date   | `YYYY-MM-DD`                                        | Important    | Cross-checks the batch; shown on the record                                                                               |
| `quota`            | string | must match the quota list, § D                      | Important    | Admission category, shown and filtered on                                                                                 |
| `enrollmentStatus` | enum   | `Enrolled` / `On leave` / `Graduated` / `Withdrawn` | **Blocking** | Awards are only granted to enrolled students, and a graduate still showing as enrolled is money paid to somebody who left |
| `province`         | string | see § D                                             | Important    | Reporting by region                                                                                                       |
| `city`             | string | see § D                                             | Important    | Determines whether a student is out of station                                                                            |
| `district`         | string | see § D                                             | Important    | Reporting                                                                                                                 |
| `domicile`         | string | city name                                           | Important    | One conditional coverage line reads it directly                                                                           |
| `photoUrl`         | string | URL, or omitted                                     | Optional     | Shown on the student record if available                                                                                  |

> **`enrollmentStatus` is the field most likely to be missing or stale, and it is
> the one with a financial consequence.** If the CMS represents this differently —
> a set of flags, a status code, a leave register kept elsewhere — please say so
> in your reply rather than mapping it approximately. We would rather receive a
> raw code and map it ourselves than receive a best guess.

### B. Academic standing

May be part of the same record or a separate call. It changes on a different
schedule from § A, which is why we list it separately — see § 7.

| Our field         | Type    | Format                                | Need      | What it drives                                                                                         |
| ----------------- | ------- | ------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------ |
| `cgpa`            | decimal | 2 decimal places, 0.00–4.00           | Blocking  | The single most-used number in the system. Every automatic rule, every threshold, every cohort ranking |
| `creditHours`     | integer | credit hours **registered this term** | Blocking  | An eligibility criterion with a hard minimum of 12                                                     |
| `creditsEarned`   | integer | cumulative                            | Important | Progress, shown on the record                                                                          |
| `currentSemester` | integer | 1-based within the programme          | Important | Duration limits — an award has a maximum number of years                                               |

Two points of definition we need confirmed rather than assumed:

- **`cgpa` must be the cumulative GPA, not the current term's GPA.** Every
  threshold in the policy — "2.65 for Fall 2024 and onwards" — is written against
  the cumulative figure.
- **`creditHours` must be the load registered for the current term**, not the
  cumulative total. The criterion "at least 12 credit hours" is a full-time
  check, and the cumulative number would pass everybody from second year onward.

### C. Fee schedule

An award is a percentage of a fee. Without an amount, the system can record that
a student has a 50% waiver and cannot say what it costs — which makes every
figure on the reporting screen unavailable.

We currently model four fee heads, and they are the four the calculation knows
by name:

| Our field    | Type    | Need      | Notes                                   |
| ------------ | ------- | --------- | --------------------------------------- |
| `tuitionFee` | decimal | Blocking  | Per semester, in PKR, before any waiver |
| `hostelFee`  | decimal | Blocking  | Zero for a student not in residence     |
| `messFee`    | decimal | Blocking  | Zero for a student not on the meal plan |
| `otherFee`   | decimal | Important | Everything else charged, as one figure  |

Three things we need to know:

1. **Are these per semester or per year?** Every number in the system is per
   semester. If the CMS publishes annual figures we will halve them, but we need
   to be told that is what we are doing rather than infer it.
2. **Is the amount the standard programme fee or the student's actual invoice?**
   These differ when a student already has a departmental concession, an
   instalment plan or a late surcharge. We want the **gross fee before any
   waiver**, because the SMS applies the waiver itself and would otherwise
   discount an already-discounted figure.
3. **Do fees vary by student, or only by programme and intake?** If only the
   latter, a fee schedule endpoint keyed by programme and batch is simpler for
   both of us than a per-student figure, and we would prefer it.

### D. Reference lists

These are lists the SMS validates against; a student whose school is not on the
list cannot be stored. We hold our own copy and refresh it, rather than trusting
free text.

| List       | Shape                          | Notes                                                            |
| ---------- | ------------------------------ | ---------------------------------------------------------------- |
| Schools    | name, sort order               | 8 today                                                          |
| Programmes | name, school, study level      | 24 today. The school link is what makes a school filter work     |
| Intakes    | label, **chronological order** | e.g. `Fall 2023`. The order is load-bearing — see below          |
| Terms      | label, start date, end date    | e.g. `Fall 2025`, 2025-07-01 to 2025-12-31                       |
| Quotas     | name                           | Admission categories: Merit, Self-Finance, Sports, Staff Ward, … |
| Geography  | province → city → district     | Used for reporting and the out-of-station rule                   |

> **Intake order is not alphabetical and not derivable from the label.** A
> scholarship can be scoped "Fall 2024 and every intake after it", and a CGPA
> threshold applies "from this intake onwards". Both need to know that Spring
> 2025 comes after Fall 2024. Please include an explicit sequence number.

**Our current intake list stops at Fall 2025 and our term list at Spring 2026.**
Whatever else changes, we need these lists to extend to the current and next
academic year, and to keep extending. This is a live gap today: the reporting
screen defaults to the current calendar year and finds nothing in it.

### E. Attendance

| Our field       | Type    | Format      | Need      |
| --------------- | ------- | ----------- | --------- |
| `attendancePct` | decimal | 0.00–100.00 | Important |

One eligibility criterion reads it, with a minimum of 75%. It is deliberately
**advisory** rather than automatic — falling below it raises a flag for a
reviewer rather than rejecting an application — so the system works without it
and works better with it.

Nothing in the SMS writes to this field. It is owned by whichever system owns
attendance, and we would rather read a stale figure with a timestamp than a
fresh figure we cannot attribute.

### F. Staff directory and sign-in

The SMS has four roles. They are graded by privilege rather than split by
department, and more will be added as the university names them:

| Role            | May do                                                                                                   |
| --------------- | -------------------------------------------------------------------------------------------------------- |
| **Super Admin** | Everything, including creating accounts and setting roles                                                |
| **Admin**       | Runs the scholarship cycle: scholarships, criteria, awards, decisions                                    |
| **Data Entry**  | Reads the queue and corrects student and application records. Cannot decide an application or move money |
| **Reporting**   | Read-only. Reports, coverage, and the review queue                                                       |

What we need from ITRC is a decision on **how a member of staff gets an
account**, and there are three workable answers:

1. **SSO.** The SMS delegates authentication to a BNU identity provider (SAML or
   OIDC) and maps a group or attribute to one of the four roles. Preferred, if
   one exists.
2. **Directory lookup.** ITRC exposes a staff endpoint; the SMS creates accounts
   from it and an administrator assigns roles.
3. **Local accounts.** A Super Admin creates each account by hand. This works
   today and needs nothing from ITRC. It is the fallback, not the ask.

If (1) or (2), we need to know which attribute carries the role, and what its
values are.

---

## 4. How we would like to receive it

We are not prescribing a technology. We are stating what the SMS can consume
without a translation layer that becomes somebody's job to maintain.

**Protocol.** REST over HTTPS, JSON responses. If ITRC's existing services are
SOAP or a database link, say so — we will adapt, and it changes our estimate
rather than our design.

**Shape.** One resource per endpoint:

```
GET  /students                      list, paginated, filterable
GET  /students/{regNo}              one student
GET  /students/{regNo}/academics    CGPA, credit hours, standing
GET  /fees?programme=&batch=        the fee schedule
GET  /reference/schools             and programmes, intakes, terms, quotas, geography
```

**Pagination.** Page number and page size, or a cursor. Please state the maximum
page size. We expect around **5,000 active students**, and we will read the whole
register on a schedule rather than one student at a time.

**Incremental sync.** The single most valuable thing you can give us, and worth
more than any individual field:

```
GET /students?modifiedSince=2026-08-01T00:00:00Z
```

Without it, keeping current means reading all 5,000 records on every cycle. With
it, a routine sync is a few dozen rows. If the CMS records a last-modified
timestamp per row, exposing it is a small change with a large effect.

**Errors.** A non-200 with a JSON body containing a stable machine-readable code
and a human-readable message. We need to distinguish "this student does not
exist" from "the service is down", because the first is a data question and the
second is a retry.

**Rate limits.** Please tell us what they are so we can pace within them rather
than discover them in production.

---

## 5. Authentication for the interface itself

Separate from § F, which is about people. This is about the SMS as a client.

Our preference, in order:

1. **OAuth 2.0 client credentials.** A client id and secret, a token endpoint, a
   scope per dataset. Rotatable without a deployment.
2. **Mutual TLS.** A client certificate we present. Fine, and we will need the
   renewal process in writing.
3. **A long-lived API key in a header.** Workable. We would want it scoped
   read-only and rotatable.

Whichever it is:

- **Scopes should be read-only.** See § 6 — we do not intend to write.
- **We need a way to rotate credentials without downtime**, meaning two valid
  credentials during a changeover.
- **Please confirm whether access is IP-restricted or requires a VPN**, and if so
  which addresses need allowing. The SMS runs on a BNU server; we will supply the
  address once the deployment target is fixed.

---

## 6. What the SMS will not do

Stated so it can be confirmed or corrected, because it determines whether you are
granting read or write access.

**The SMS does not write to the CMS.** Not student records, not CGPA, not fees,
not attendance. Everything it owns — scholarships, awards, applications,
decisions, the audit trail — lives in its own schema and has no counterpart in
the CMS.

There is one thing worth flagging, and we would like a ruling on it. The SMS
today allows an administrator to correct a student's record — a CGPA typo, a
wrong programme — with a reason recorded in the audit trail. Once the CMS is the
source, that correction would be overwritten at the next sync. We see three
options and would take direction:

- **(a)** Make student fields read-only in the SMS and send people to the CMS.
  Cleanest. The correction happens once, in the right place.
- **(b)** Keep local edits, and have them survive a sync as a documented
  override. Honest but adds a second version of the truth.
- **(c)** Keep local edits and let the sync overwrite them. Worst of both — we
  raise it only to rule it out explicitly.

We recommend (a) unless ITRC sees a reason not to.

---

## 7. How fresh each dataset needs to be

Different data changes on different clocks, and treating it all the same means
either syncing too often or being wrong for too long.

| Dataset           | Changes                                  | Freshness we need                                                                     |
| ----------------- | ---------------------------------------- | ------------------------------------------------------------------------------------- |
| Student master    | On admission, and on correction          | Daily is fine. Same-day for new intakes                                               |
| Enrollment status | Continuously, and it matters immediately | **Daily at minimum.** A withdrawal we do not see is money leaving the university      |
| CGPA              | At the end of each term, in a batch      | Within a day of results publication. This is the sync that gates a whole review cycle |
| Credit hours      | During the registration window           | Daily while registration is open                                                      |
| Fees              | Once per intake, occasionally revised    | Weekly, or on notification                                                            |
| Attendance        | Weekly or continuously                   | Weekly                                                                                |
| Reference lists   | Rarely; intakes and terms once a term    | Weekly, plus before each new term                                                     |

**The one that matters most is CGPA at results time.** The scholarship review
cycle cannot start until the SMS has the new CGPAs, and every day of delay is a
day of the review window lost. If there is a way to be notified that results have
been published — a webhook, a flag on an endpoint, or an email to a person — it
is worth more than a faster polling interval.

---

## 8. Data quality: five things that fail silently

These are not preferences. Each one produces a system that runs, shows numbers,
and is wrong — which is worse than one that stops.

1. **Character encoding must be UTF-8 end to end.** Student names carry Urdu and
   Punjabi characters. A non-Unicode character set does not raise an error; it
   substitutes question marks, and the name is gone. On the Oracle side this
   means `AL32UTF8`. See the appendix.

2. **Dates must be ISO 8601: `YYYY-MM-DD`, zero-padded.** Not `1/2/2026`, which
   is two different days depending on who reads it, and not `2026-8-1`. Parts of
   the system compare dates as text on the stated ground that ISO dates sort
   correctly. `2026-8-1` does not throw — it sorts into the wrong term and
   misreports a scholar count.

3. **Timestamps must carry a timezone, and we would prefer UTC.** The SMS stores
   in UTC throughout. A timestamp with no offset is completed from whatever zone
   the reader is in, and the same instant lands five hours apart depending on the
   machine. This has already cost us once.

4. **Absent means absent, not empty string.** If a student has no phone number,
   send `null` or omit the field. `""` is a different thing, and Oracle stores it
   as `NULL` anyway — so a required field arriving empty becomes a constraint
   violation in one place and a silent blank in another.

5. **Numbers must be numbers.** `"3.45"` in quotes is a string, and a threshold
   comparison against a string does not fail — it takes a different branch and
   passes everybody. We have had exactly this defect and it took a deliberate
   test to find. Decimals unquoted, please, with the scale stated: CGPA to 2
   places, money to 2 places.

---

## 9. Decisions we need from ITRC

Nine questions. Answers to these are enough for us to begin.

1. **Does an API exist today?** If there is an existing CMS interface — even a
   partial or internal one — we would rather use it than have one built. Please
   send whatever documentation exists, however rough.

2. **Which of the six datasets in § 3 can ITRC expose, and on what timeline?** A
   phased delivery is fine, and we would take them in the priority order given:
   students and academics first, fees and reference next, attendance and staff
   directory after.

3. **Can rows carry a last-modified timestamp** so we can sync incrementally
   (§ 4)? This is the single highest-value item on this list.

4. **Are fees per semester or per year, gross or net of existing concessions, and
   per student or per programme?** (§ C.)

5. **How is enrollment status represented in the CMS**, and is it maintained
   promptly enough that a withdrawal shows up within a day? (§ A.)

6. **Is there an identity provider we can authenticate staff against** (SAML or
   OIDC), and if so which attribute carries a role? If not, we proceed with local
   accounts. (§ F.)

7. **Which authentication method for the interface itself** — OAuth client
   credentials, mTLS, or an API key — and is access IP-restricted or behind a
   VPN? (§ 5.)

8. **Can we have a non-production environment** with a realistic dataset, and
   separate credentials for it? We will not test against live student data, so
   without a sandbox the integration cannot be verified before it is relied on.

9. **Who is the technical contact**, and what is the process for reporting a data
   problem — a record that will not map, a field that stopped arriving — and
   getting an answer?

---

## Appendix — two Oracle questions, still open

Not API questions, but the same body answers them and they have been outstanding
since the database work began. Both affect whether the SMS can be deployed on
BNU's Oracle instance at all.

**A1. Does the SMS get its own instance, or a schema on an existing one?**

In Oracle a user is a schema, so this decides how the SMS is isolated. It also
decides whether our automated test suite can run in BNU's environment at all: the
suite drops and recreates every table it can see, which is safe in a schema of
its own and unacceptable anywhere else. If the answer is a shared instance, we
need a second schema for tests or we run them elsewhere.

**A2. Is the database character set `AL32UTF8`?**

Please confirm by running:

```sql
SELECT parameter, value
  FROM nls_database_parameters
 WHERE parameter IN ('NLS_CHARACTERSET', 'NLS_NCHAR_CHARACTERSET');
```

We need `NLS_CHARACTERSET` to be `AL32UTF8`. If it is `WE8MSWIN1252` or another
single-byte set, Urdu and Punjabi characters in student names are replaced with
question marks on the way in, without an error and without a way to recover them
afterwards. Changing the character set of a populated database is not a small
job, which is why we are asking before rather than after.

_A third question — whether Oracle Text is installed — is no longer blocking. We
have handled both cases in application code and it changes nothing either way._

---

## What happens next

Send back answers to the nine questions in § 9 — a reply in the body of an email
is entirely sufficient, and we do not need a formal specification to start.

From that we will produce a mapping document: your field names against ours,
with the conversion for each, for ITRC to check before we write any integration
code. That review is where mismatches get caught cheaply.

Meanwhile the SMS continues to run on generated data, and every part of it that
does not depend on the CMS — the catalogue, the merge, the application queue, the
audit trail, the reporting — is finished and testable today.
