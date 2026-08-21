<?php

declare(strict_types=1);

namespace App\Persistence;

use Illuminate\Contracts\Database\Query\Builder;

/**
 * whereIn, for lists Oracle would refuse.
 *
 * Oracle caps an IN list at 1000 expressions and raises ORA-01795 at 1001. That
 * is not a tuning limit, it is a hard parser limit, and it is measured on this
 * database:
 *
 *     1000_expressions = OK
 *     1001_expressions = ORA-01795: maximum number of expressions in a list is 1000
 *
 * Which makes it a live problem rather than a theoretical one. AGENTS.md sizes
 * this application at 5,000 students and tells us to load the working set in
 * bulk queries — so the first person to load a full cohort by registration
 * number gets an error, and gets it in production rather than in development
 * where the seed is 112 students.
 *
 * The fix is to OR several IN lists together rather than to run several
 * queries. It stays one round trip, it composes with whatever else is already
 * on the builder, and Oracle applies the 1000 limit per list rather than per
 * statement. The parenthesised group matters: without it the ORs would escape
 * and widen any WHERE already present.
 *
 * An empty list is left to whereIn, which compiles to a contradiction and
 * returns nothing — the right answer, and not the same as no filter at all.
 */
final class ChunkedIn
{
    public const ORACLE_MAX_EXPRESSIONS = 1000;

    /**
     * @param  array<int, mixed>  $values
     */
    public static function apply(Builder $query, string $column, array $values): Builder
    {
        $values = array_values(array_unique($values));

        if (count($values) <= self::ORACLE_MAX_EXPRESSIONS) {
            return $query->whereIn($column, $values);
        }

        return $query->where(function (Builder $grouped) use ($column, $values) {
            foreach (array_chunk($values, self::ORACLE_MAX_EXPRESSIONS) as $chunk) {
                $grouped->orWhereIn($column, $chunk);
            }
        });
    }
}
