<?php

declare(strict_types=1);

namespace Database\Seeders\Demo;

use Illuminate\Support\Facades\DB;

/**
 * Writing rows the way Oracle expects to be handed them.
 *
 * The demo seeder inserts through the query builder rather than through
 * Eloquent, because 2,000 students, ~600 awards and ~400 applications is
 * several thousand round trips as models and a few dozen as chunked inserts.
 * The price is that the casts stop happening, so the four conversions Eloquent
 * would have done have to be done here — and each of them fails in a way worth
 * naming, since none of them raises anything at insert time.
 *
 * All four are specific to this stack, and all four are settled elsewhere in
 * the codebase; this is the one place the seeder repeats them.
 */
final class Row
{
    /**
     * Oracle inserts more slowly the wider the statement, and INSERT ALL has a
     * bind-variable ceiling well below "all of them". 200 rows of a 30-column
     * table is 6,000 binds, comfortably inside it, and large enough that the
     * per-statement overhead has stopped mattering.
     */
    public const CHUNK = 200;

    /**
     * A DATE column value.
     *
     * The connection sets NLS_DATE_FORMAT to 'YYYY-MM-DD HH24:MI:SS' for the
     * session, and Oracle converts a bound string using exactly that format. A
     * bare '2025-09-01' relies on it forgiving the missing half. Midnight is
     * what a DATE stores for these anyway, so nothing about the value changes —
     * only whether the conversion is asked for or assumed.
     */
    public static function date(string $ymd): string
    {
        return $ymd.' 00:00:00';
    }

    /**
     * A TIMESTAMP WITH TIME ZONE column value.
     *
     * The offset is written out rather than left off. Laravel binds timestamps
     * without one and relies on the session zone to fill the gap, which is why
     * config/database.php pins TIME_ZONE to +00:00 — the defect that caused was
     * a silent five-hour shift on six columns. Both forms land on the same
     * instant with that setting in place; this one also lands there without it.
     */
    public static function timestamp(string $ymd, string $his = '00:00:00'): string
    {
        return $ymd.' '.$his.' +00:00';
    }

    /**
     * A plain TIMESTAMP column value — created_at, updated_at, and nothing else.
     *
     * The distinction from timestamp() is not cosmetic and cost a seed run to
     * find. `$table->timestamps()` compiles to TIMESTAMP(6); only the six
     * columns declared timestampTz() are TIMESTAMP WITH TIME ZONE. Oracle
     * converts a bound string with NLS_TIMESTAMP_FORMAT, which is
     * 'YYYY-MM-DD HH24:MI:SS' and has nowhere to put an offset — so the trailing
     * ' +00:00' that the tz columns require is ORA-01830 on these.
     *
     * Both are UTC. app.timezone is UTC and the session is pinned to it, so a
     * wall clock with no offset written here means the same instant as the same
     * wall clock with +00:00 written there.
     */
    public static function stamp(string $ymd, string $his = '00:00:00'): string
    {
        return $ymd.' '.$his;
    }

    /** A NUMBER(1) boolean. There is no boolean type on 19c. */
    public static function bool(bool $value): int
    {
        return $value ? 1 : 0;
    }

    /**
     * A json() column, which on 19c is a CLOB with an IS JSON constraint.
     *
     * Eloquent's array cast would encode this. The query builder hands the
     * value through untouched, and an array reaching the driver is not an
     * error the driver can report usefully.
     */
    public static function json(array $value): string
    {
        return json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }

    /**
     * Insert rows in chunks, and say how many went in.
     *
     * Keys are squared off first, and that is not tidiness. A multi-row insert
     * takes its column list from the **first** row and then binds every later
     * row positionally, so a list whose rows carry different keys produces a
     * statement whose columns and values do not line up — the values slide into
     * the wrong columns, or the bind count comes up short and Oracle rejects a
     * statement whose SQL looks perfectly reasonable in the error message.
     *
     * That is reachable here because one table is written by more than one
     * generator: domain_events gets rows from the award, application and donor
     * generators, and only the last of those carries donor_id and amount_pkr.
     * Filling the union of keys with null costs nothing and removes a whole
     * class of failure that only appears when a new generator is added.
     *
     * @param  list<array<string, mixed>>  $rows
     */
    public static function insert(string $table, array $rows): int
    {
        foreach (array_chunk(self::squared($rows), self::CHUNK) as $chunk) {
            DB::table($table)->insert($chunk);
        }

        return count($rows);
    }

    /**
     * Every row given the same keys, missing ones filled with null.
     *
     * @param  list<array<string, mixed>>  $rows
     * @return list<array<string, mixed>>
     */
    private static function squared(array $rows): array
    {
        if ($rows === []) {
            return [];
        }

        $columns = [];

        foreach ($rows as $row) {
            foreach (array_keys($row) as $column) {
                $columns[$column] = null;
            }
        }

        return array_map(
            // Union in this order so the row's own values win and the nulls
            // only fill what it did not have.
            fn (array $row) => $row + $columns,
            $rows,
        );
    }
}
