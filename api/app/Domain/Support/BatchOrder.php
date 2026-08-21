<?php

declare(strict_types=1);

namespace App\Domain\Support;

/**
 * The intakes, in order.
 *
 * Order is the whole point. Two rules depend on it and neither can be
 * expressed without it:
 *
 *   - A scholarship with batchMode "onwards" covers its batch and every later
 *     one.
 *   - A CGPA threshold applies from its batch forward, until a later threshold
 *     takes over.
 *
 * Sorting the labels alphabetically would put Fall before Spring and quietly
 * invert both. Hence an explicit sequence.
 *
 * This lives in the domain rather than in the seeder because the domain
 * services need a default and must not reach into Database\Seeders to get one.
 * ReferenceSeeder reads it from here, so the database and the default agree by
 * construction. Callers that have loaded the batches table should pass their
 * own list — this is the fallback, not the authority.
 */
final class BatchOrder
{
    public const DEFAULT = [
        'Fall 2021',
        'Spring 2022',
        'Fall 2022',
        'Spring 2023',
        'Fall 2023',
        'Spring 2024',
        'Fall 2024',
        'Spring 2025',
        'Fall 2025',
    ];
}
