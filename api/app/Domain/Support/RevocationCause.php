<?php

declare(strict_types=1);

namespace App\Domain\Support;

/**
 * Why an award ended. Four causes, because there are four code paths.
 *
 * The list is closed for a reason the audit trail cannot express: this is the
 * column the per-term gained/lost report groups by. A cause outside this set is
 * a bucket no report has a row for and no screen can filter to — the award is
 * gone, the student's funding stopped, and the number explaining why it stopped
 * lands nowhere.
 *
 * It was validated as ['required', 'string', 'max:255'], so
 * `POST /api/awards/{id}/revoke` accepted anything, including control
 * characters. AGENTS.md already states the rule this breaks: never put a value
 * a report needs somewhere a report cannot count it. A free-text cause is the
 * same mistake as the interpolated audit sentence that rule was written about.
 *
 * A second copy of the RevocationCause union in src/lib/scholarship/types.ts,
 * kept honest by ClosedSetTest, which parses that file and fails if the two
 * disagree — the same arrangement EnrollmentStatus and RoleMatrix have.
 */
final class RevocationCause
{
    /** A person ended it, from the award or the student screen. */
    public const BY_HAND = 'Revoked by hand';

    /** The scholarship was retired and its awards ended with it. */
    public const SCHOLARSHIP_ARCHIVED = 'Scholarship archived';

    /** An approved application was reopened, so the award it produced ended. */
    public const APPLICATION_REOPENED = 'Application reopened';

    /**
     * A batch assignment was undone.
     *
     * Never written today: undoBatch deletes its awards outright rather than
     * revoking them, deliberately, so an undone mis-click is not something a
     * student is recorded as having lost. It stays in the set because types.ts
     * declares it and the two lists must match.
     */
    public const BATCH_UNDONE = 'Batch undone';

    /** @var list<string> */
    public const ALL = [
        self::BY_HAND,
        self::SCHOLARSHIP_ARCHIVED,
        self::APPLICATION_REOPENED,
        self::BATCH_UNDONE,
    ];
}
