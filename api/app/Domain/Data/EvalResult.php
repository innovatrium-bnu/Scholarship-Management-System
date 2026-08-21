<?php

declare(strict_types=1);

namespace App\Domain\Data;

/**
 * One student's verdict against one scholarship.
 *
 * Mirrors EvalResult in src/lib/scholarship/evaluate.ts.
 *
 * `reasons` is prose because it is shown to whoever is running the assignment,
 * and the useful version of "not eligible" is the one that says why. An
 * Eligible result carries an empty list rather than a reason for passing.
 */
final readonly class EvalResult
{
    public const ELIGIBLE = 'Eligible';

    /** A rule needs a human to tick something. Not a rejection. */
    public const PENDING_VERIFICATION = 'PendingVerification';

    public const NOT_ELIGIBLE = 'NotEligible';

    /** Already holds this scholarship, so there is nothing to decide. */
    public const ALREADY_HOLDS = 'AlreadyHolds';

    /** @param string[] $reasons */
    public function __construct(
        public Student $student,
        public string $status,
        public array $reasons,
        /** Set only when the scholarship has a Cohort rank rule. */
        public ?int $rank = null,
        public ?float $percentile = null,
    ) {}
}
