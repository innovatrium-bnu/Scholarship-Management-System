<?php

declare(strict_types=1);

namespace App\Persistence;

use Carbon\CarbonInterface;

/**
 * The one place that decides how a date becomes a string.
 *
 * The domain services take dates as strings, not as Carbon — because their
 * TypeScript originals take strings, and staying a transliteration is what
 * keeps the two computing the same answers. Eloquent hands us Carbon. This is
 * the seam, and it is a single class because the format is load-bearing in a
 * way that is easy to miss:
 *
 * ReportService compares effectiveFrom with strcmp rather than with a date
 * library, on the stated grounds that ISO-8601 dates sort lexicographically.
 * That is true only while every producer writes the same shape. One mapper
 * emitting "2026-8-1" instead of "2026-08-01" does not throw; it sorts wrong,
 * and a dashboard quietly reports the wrong number of scholars.
 *
 * The two shapes come from seed.ts, which is the specification here:
 *   date      "2024-09-01"                 effectiveFrom, dateOfBirth,
 *                                          admissionDate, uploadedAt
 *   timestamp "2025-07-14T09:07:00.000Z"   submittedAt, event at
 *
 * Timestamps are rendered in UTC, always. The session is pinned to UTC in
 * config/database.php and app.timezone is UTC, so this converts nothing in
 * practice — it is here so that a future connection which is not UTC cannot
 * change what the strings say.
 */
final class DomainDate
{
    /** JavaScript's Date#toISOString: milliseconds, and a literal Z. */
    private const TIMESTAMP = 'Y-m-d\TH:i:s.v\Z';

    private const DATE = 'Y-m-d';

    public static function date(?CarbonInterface $value): ?string
    {
        return $value?->format(self::DATE);
    }

    public static function timestamp(?CarbonInterface $value): ?string
    {
        return $value?->copy()->utc()->format(self::TIMESTAMP);
    }

    /**
     * The term a date falls in: "Spring 2026", "Fall 2026".
     *
     * A transliteration of semesterOf() in seed.ts, month for month — terms run
     * January to June and July to December, and the rule is arithmetic rather
     * than a lookup against the semesters table. That matters: events carry the
     * resolved label so reports can group by term without re-deriving it, and a
     * backend that resolved terms differently from the browser would file the
     * same award under two different terms.
     *
     * seed.ts returns the empty string for an unparseable date. Here that would
     * violate the empty-string convention on its way into a nullable column, so
     * this returns null and the column stores null — the same absence, spelled
     * the way Oracle spells it.
     */
    public static function semesterOf(?string $date): ?string
    {
        if ($date === null || $date === '') {
            return null;
        }

        $parsed = date_create($date);

        if ($parsed === false) {
            return null;
        }

        $month = (int) $parsed->format('n');
        $year = $parsed->format('Y');

        return ($month <= 6 ? 'Spring ' : 'Fall ').$year;
    }

    /**
     * The inverse of semesterOf: the date a term begins.
     *
     * A transliteration of dateOfSemester() in seed.ts. Terms start in February
     * and September, matching the admission dates in the student data. Used
     * where a screen gives a term but a column needs a date — revoking an award
     * "from Fall 2026" has to become a date the money actually stops on.
     *
     * An unrecognised label is returned unchanged, as seed.ts does, so a caller
     * that already passed a date gets it back.
     */
    public static function dateOfSemester(string $label): string
    {
        $parts = explode(' ', $label);

        if (count($parts) !== 2 || preg_match('/^[0-9]{4}$/', $parts[1]) !== 1) {
            return $label;
        }

        return $parts[1].($parts[0] === 'Spring' ? '-02-01' : '-09-01');
    }

    /**
     * Whether a string is already an ISO date rather than a term label.
     *
     * store.tsx accepts either at the revocation boundary, because one screen
     * offers a date picker and another offers a list of terms. The same test
     * decides which, so the two agree on what "2026-09-01" means.
     */
    public static function looksLikeDate(string $value): bool
    {
        return preg_match('/^[0-9]{4}-[0-9]{2}-[0-9]{2}/', $value) === 1;
    }

    /**
     * A date the domain produced, on its way back to a column.
     *
     * Returns null for null and for the empty string, which by the empty-string
     * convention are the same thing.
     */
    public static function toDatabase(?string $value): ?string
    {
        return ($value === null || $value === '') ? null : $value;
    }
}
