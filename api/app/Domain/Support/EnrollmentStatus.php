<?php

declare(strict_types=1);

namespace App\Domain\Support;

/**
 * Whether a student is actually studying.
 *
 * Four values, and the distinction between them decides money. Awards are only
 * granted to students who are Enrolled; a graduate still carrying that status
 * is funding paid to somebody who has left, and a withdrawal nobody recorded is
 * the same thing more slowly.
 *
 * This list exists because the column did not have one. `enrollment_status` is
 * a plain varchar2 with no check constraint, and the update endpoint validated
 * it as ['sometimes', 'string'] — so `PATCH /api/students/{regNo}` with
 * "Abducted by aliens" returned 200 and stored it. The row then belonged to no
 * status: absent from every filter, counted in no report, and invisible to the
 * "is this student enrolled" test that gates an award. Nothing raised anything,
 * because nothing had ever been asked to.
 *
 * A second copy of the EnrollmentStatus union in src/lib/scholarship/types.ts,
 * kept honest by EnrollmentStatusTest, which parses that file and fails if the
 * two disagree. The same approach RoleMatrix takes to roles.ts and
 * ReferenceSeeder takes to the seed lists: duplication is accepted where the
 * alternative is the server asking the client what is valid, and a test holds
 * the copies together.
 */
final class EnrollmentStatus
{
    public const ENROLLED = 'Enrolled';

    public const ON_LEAVE = 'On leave';

    public const GRADUATED = 'Graduated';

    public const WITHDRAWN = 'Withdrawn';

    /** @var list<string> */
    public const ALL = [
        self::ENROLLED,
        self::ON_LEAVE,
        self::GRADUATED,
        self::WITHDRAWN,
    ];

    /**
     * Whether this student counts as studying right now.
     *
     * The one question the rest of the system actually asks. Stated here rather
     * than as `=== 'Enrolled'` scattered across callers, so that a fifth status
     * — Suspended, Deferred — is one decision in one place rather than a search
     * for every comparison.
     */
    public static function isStudying(?string $status): bool
    {
        return $status === self::ENROLLED;
    }
}
