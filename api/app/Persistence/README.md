# Persistence

The layer between Eloquent and `app/Domain`. It loads rows, turns them into the
plain values the domain takes, calls the domain, and writes results back.

It exists so that `app/Domain` never has to. Those services are a
transliteration of `src/lib/scholarship` — same order of operations, same float
arithmetic — which is what lets 132 unit tests mirror the TypeScript suite case
for case, and what lets the browser draw coverage bars that agree with the
server to the rupee. A query inside a service would end all of that.
`DomainPurityTest` enforces it.

```
  Http (Phase 8)
        |
  Persistence  ──────  loads, maps, orchestrates, writes
        |
     Domain     ──────  pure functions over plain values
```

Dependencies point one way only. The domain does not know this layer exists.

## The three kinds of thing in here

**`Mappers/`** turn a model into a domain value object. They read relations but
never load them — a mapper that lazy-loads is an N+1 waiting for a list. They
expect the repository to have eager-loaded what they need.

**`Repositories/`** own the queries. Every read eager-loads what its mapper
needs, and anything that could be asked per-row has a bulk form
(`activeForStudents`, `criteriaByScholarship`, `findMany`).

**Orchestrators** at the root — `ApplicationScreener` today — load a working
set, call a domain service, and return the result. This is where a fact that
lives in *other rows* is worked out before the domain is asked to judge it.

## Two things here change answers, not shapes

Most of this layer is transport. These two are not, and both fail silently:

**`ScholarshipMapper::threshold()`.** `Rule::$threshold` is `string|float|int`
because `types.ts` types it `string | number`. Oracle has no such union, so the
column is a `varchar2` and everything returns as a string. Then
`EvaluationService::passesAutomatic` tests
`is_numeric($t) && ! is_string($t)` — a threshold left as `"3.5"` fails that,
the CGPA comparison never runs, and execution falls through to a branch that
scrapes a number out of the rule's English description or, with no description,
passes every student. A CGPA rule that quietly stops rejecting anyone. The
mapper hands numeric-looking values back as numbers.

**`DomainDate`.** `ReportService` compares dates with `strcmp`, on the stated
grounds that ISO-8601 sorts lexicographically — true only while every producer
writes the same shape. One mapper emitting `2026-8-1` does not throw, it sorts
wrong, and a dashboard reports the wrong number of scholars. So the two formats
live in one class: `Y-m-d` for dates, and JavaScript's exact
`Y-m-d\TH:i:s.v\Z` for timestamps.

## `ChunkedIn`

Oracle caps an `IN` list at 1000 expressions and raises **ORA-01795** at 1001,
measured on this database. `AGENTS.md` sizes the application at 5,000 students
and asks for bulk loads, so `whereIn` over a full cohort is a production error
waiting for a real dataset — development seeds 112 students, well under the
limit. Every repository that takes a list of ids goes through `ChunkedIn`, which
ORs several `IN` lists inside one parenthesised group: one round trip, composes
with existing constraints, and each list stays under the cap.

## Conventions

- Models are aliased on import — `use App\Models\Award as AwardRecord` — because
  the domain class of the same name is usually in the same file. See
  `app/Models/README.md` for why both names are right.
- Repositories return domain objects, never models. A model escaping this layer
  is a lazy-load in someone else's code.
- Scholarship lists are always in precedence order. Any other order does not
  fail, it computes different money.
- Nothing here opens a transaction. Granting an award and recording the event
  are one atomic act, so the caller owns the transaction and these join it.
