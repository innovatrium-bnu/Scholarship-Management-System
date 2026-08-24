<?php

declare(strict_types=1);

namespace Database\Seeders\Demo;

use Database\Seeders\ReferenceSeeder;

/**
 * Turning terms into dates and back, the way the rest of the system does.
 *
 * Three rules live here rather than in each generator, because all three are
 * places where two callers agreeing by accident is the only thing keeping the
 * data consistent.
 *
 * `semesterOf` classifies a date by BNU's own split — Spring is January to
 * June, Fall is July to December — which is why an award dated 2025-09-01
 * belongs to Fall 2025. `dateOf` is its inverse for the purpose a form needs:
 * the date teaching starts, 1 February and 1 September.
 *
 * And every date this file produces is `YYYY-MM-DD`, zero-padded, because
 * ReportService compares dates with strcmp on the stated grounds that they sort
 * lexicographically. A single `2026-8-1` would not throw. It would sort wrong,
 * and misreport a scholar count.
 */
final class Terms
{
    /** ReferenceSeeder::SEMESTERS, which is seed.ts SEMESTERS. */
    public const ALL = ReferenceSeeder::SEMESTERS;

    /** The term the demo register is sitting in. */
    public const CURRENT = StudentGenerator::CURRENT_SEMESTER;

    /** Where CURRENT falls in ALL. Nothing in the demo is dated after it. */
    public static function currentIndex(): int
    {
        return (int) array_search(self::CURRENT, self::ALL, true);
    }

    /** The label at $index, clamped to the ends rather than running off them. */
    public static function at(int $index): string
    {
        return self::ALL[max(0, min(count(self::ALL) - 1, $index))];
    }

    /**
     * The term a date falls in.
     *
     * BNU's own split: Spring runs January to June, Fall July to December,
     * which is why a receipt dated 2026-09-12 belongs to Fall 2026. Returns the
     * label even for a term outside ALL — a real date in Fall 2022 should say
     * so rather than be clamped into a term the university has a record of.
     */
    public static function semesterOf(string $date): string
    {
        $month = (int) substr($date, 5, 2);
        $year = substr($date, 0, 4);

        return ($month <= 6 ? 'Spring ' : 'Fall ').$year;
    }

    /** The date teaching starts in $label. */
    public static function dateOf(string $label): string
    {
        [$term, $year] = explode(' ', $label);

        return sprintf('%s-%s-01', $year, $term === 'Spring' ? '02' : '09');
    }

    /**
     * The term a batch's students could first hold an award in.
     *
     * An intake that predates the demo's earliest term is clamped to it — the
     * event log only goes back to Fall 2023, and an award granted before that
     * would be a grant nothing can count.
     */
    public static function earliestFor(string $batch): int
    {
        $index = array_search($batch, self::ALL, true);

        return $index === false ? 0 : (int) $index;
    }
}
