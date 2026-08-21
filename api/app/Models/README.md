# Models

22 models over the 22 application tables, plus `User`. The nine framework
tables (`cache`, `jobs`, `sessions`, `password_reset_tokens`, and the rest) have
no models because Laravel drives them directly.

Everything here is persistence and nothing else. The rules about money and
eligibility live in `app/Domain/`, which is pure and stays pure — see the note
on the boundary below.

## They share names with `App\Domain\Data` on purpose

`App\Models\Award` and `App\Domain\Data\Award` are different classes for
different jobs, and both names are right:

| | `App\Domain\Data\*` | `App\Models\*` |
| --- | --- | --- |
| What it is | An immutable value object | A database row |
| Shape | `readonly`, camelCase, constructor-injected | Eloquent, snake_case columns |
| Knows about the database | No, and must not | Yes, that is its whole job |
| Mirrors | `src/lib/scholarship/types.ts` | `database/migrations/` |

The domain services take the `Data` classes because that is what keeps them 1:1
with their TypeScript originals and testable without a database. Phase 7 maps
between the two. A file needing both should alias one — importing
`App\Models\Award as AwardRecord` reads better than either bare name.

## Casts follow the Oracle type, not the Laravel one

Three rules, and all three fail silently if forgotten:

- **`boolean`** for every `NUMBER(1)`. Uncast, these read back as `1` and `0` —
  truthy and falsy, but never `=== true`.
- **`array`** for every `json` column. On 19c those are CLOBs with an `IS JSON`
  check constraint, so uncast they read back as a JSON *string* nobody called
  `json_decode` on.
- **`datetime`** for every `timestampTz`. The session is pinned to UTC in
  `config/database.php`; see the note there for what happens when it is not.

`ModelSchemaTest` enforces all three column by column, and `ModelPersistenceTest`
proves they survive a write and a read.

## Money is cast to `float`

Not `decimal:2`, which would return strings. The domain services are typed
`float` because they are a port of TypeScript, where every number is a double —
`App\Domain\Support\JsNumber` exists to reproduce that rendering exactly, and
the suite compares money with a `toEqualMoney` delta for the same reason.
Casting to float here means a model attribute drops into a domain service with
no conversion at the call site, which is one fewer place to forget one.

## Keys

- **Reference tables are keyed by their natural string** — a school's `name`, a
  batch's `label`. The domain compares those strings directly, so a surrogate
  integer would mean a join on every comparison to recover the string the logic
  wanted anyway. These models set `$primaryKey`, `$keyType` and
  `$incrementing = false`.
- **`students` is keyed by `reg_no`**, the university's own identifier.
- **Everything else uses ULIDs** via `HasUlids`. `EligibilityCriteria` is the
  exception that proves it: its key is the scholarship's id, not one of its
  own, so it does not use the trait.

## Renamed columns

Three columns could not keep the name the domain uses, because Oracle reserves
it. Use the column name in models and queries:

| Domain says | Column is |
| --- | --- |
| `mode` | `assignment_mode` |
| `by` | `revoked_by` / `decided_by` |
| `timestamp` | `occurred_at` |

## Vocabulary lives in the domain

Models deliberately declare no `STATUS_ACTIVE`-style constants. Those already
exist on the `App\Domain\Data` classes, and a second copy is a second thing to
keep in step. Scopes like `->active()` are fine; the string they compare against
belongs to the domain.

## The empty string

Every model inherits `Concerns\NormalisesEmptyStrings` from `App\Models\Model`
(`User` applies it by hand, since it extends `Authenticatable`). Oracle stores
`''` as NULL and cannot be told otherwise, so nothing here ever writes one.
Compare against `null`, never `''`. AGENTS.md has the full rule.
