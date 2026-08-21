# Http

29 endpoints, one per operation in `src/lib/scholarship/store.tsx`. That file is
the specification: the SPA already implements every one of these flows against
an in-memory context, and Phase 10 swaps the backing for these routes without
changing a screen.

Controllers stay thin. Reads go through `App\Persistence` repositories so they
arrive already mapped, ordered and eager-loaded; writes go through
`App\Persistence\Writers`, which own the transactions. A controller that grew a
query would be reaching past the layer built to hold it.

## The wire is camelCase, the database is snake_case

`types.ts` is camelCase and the frontend round-trips these objects verbatim, so
that is what the API speaks — in both directions. Form requests translate:
`ScholarshipRequest::columns()` and `AssignmentRequest::picks()` return the
payload spelled the way the columns are, so no controller knows both spellings.

Responses are built by `Resources\DomainJson`, which walks a domain value object
rather than restating its fields. The `App\Domain\Data` classes already mirror
`types.ts` field for field, so a hand-written resource per entity would be a
second copy of `types.ts` to keep in step with the first.

**Null is omitted, never sent.** `types.ts` writes optionals as
`donorName?: string`, which is `string | undefined` — not `string | null`. An
explicit `"donorName": null` would fail to typecheck at every optional field in
the app. Absent key is what `?` means. Zero, `false` and `[]` all survive; only
null is absence.

## Authentication

Cookie sessions, not tokens. The SPA and the API are one origin in production —
nginx serves `/api` from Laravel and everything else from `dist/` — and in
development the Vite server proxies `/api` and `/sanctum` so it is one origin
there too. That keeps the deployed and local setups the same shape, and keeps a
bearer token out of `localStorage` where any script on the page can read it.

The client flow is Sanctum's: `GET /sanctum/csrf-cookie`, then
`POST /api/auth/login`. `bootstrap/app.php` calls `statefulApi()`, which is what
puts session and CSRF middleware on the `api` group for requests whose origin
appears in `SANCTUM_STATEFUL_DOMAINS`. Anything else stays stateless.

`POST /api/auth/login` answers the same way for a wrong password as for an
unknown address. Distinguishing them turns the login form into a way of asking
which addresses have accounts, which for a university is a staff list.

## Authorisation

`src/lib/scholarship/roles.ts` has described the permission model since before
there was a backend, and said plainly that it "cannot keep anyone out".
`App\Auth\RoleMatrix` is the enforcing half — the same four roles and six
capabilities, port for port. `RoleMatrixTest` parses `roles.ts` and fails if the
two ever disagree, the way `ReferenceDataTest` guards the seed lists.

Gates, not model policies. The model is about capabilities, not rows: `roles.ts`
asks "may this role decide applications", never "may this role decide *this*
application". They are registered from the matrix in `AppServiceProvider`, so a
capability added there is enforceable the moment a route names it.

Every route except login is behind `auth:sanctum`. Writes carry
`can:<capability>`. Reads are gated on authentication alone, except the
application queue, which names `applications.read` explicitly — every role holds
it today, so the two are equivalent, but a role added later that should not read
applications would otherwise get in silently.

`GET /api/auth/me` returns the user's capabilities so screens can hide controls
the API would refuse. That is a convenience, never the check.

## Who did it

Every mutation records an actor, resolved by `App\Http\Actor` — now the
authenticated user's role. Phase 8 routed every controller through that one
call, so authentication landed in one file rather than twenty. The `X-Role`
header it used to read is ignored: it described who the user *said* they were.

The role still reaches the audit log as a string rather than a foreign key to
`users`, deliberately. An audit row has to stay readable after the account that
wrote it is gone — people leave the Registrar Office — and a trail that goes
blank when someone is deprovisioned is not a trail.

## Status codes that carry meaning

| Code | Used for |
| --- | --- |
| `201` | A row was created — assignment, decision, revocation, scholarship |
| `204` | An undo that removed something |
| `404` | Route-model binding found nothing |
| `409` | The request is well-formed but the world moved: a batch already undone, an application already decided, an award already revoked |
| `422` | Validation, and two policy refusals — deleting a core fee head, or one an active scholarship still covers |

`409` rather than `204` on a repeated undo is deliberate. It is not an error in
the request and it is not success either; reporting success invites a screen
that shows an undo which did nothing.

## Ordering rules that are not cosmetic

- **Scholarship lists are always in precedence order.** The browser runs its own
  copy of the merge to draw coverage bars and takes the order it is given. Any
  other order does not fail, it computes different money.
- **`scholarships/precedence` and `applications/reject` are declared before
  their wildcard routes**, or "precedence" is read as a scholarship id.
- **A new scholarship is created last in precedence**, not first. Precedence is
  a claim on money, and a new scholarship should not outrank every existing one
  before anybody decided it should.

## Not here yet

No file upload for application documents; `file_name` is metadata only and the
storage column is deliberately absent rather than nullable, so nothing
half-works.

No account management: users are created by `UserSeeder`, one per role, with
generated passwords logged once at seed time. There is no registration endpoint
and no password reset, and `role` is deliberately absent from `User`'s fillable
list so that no future endpoint filling a `User` from request data can grant
one.
