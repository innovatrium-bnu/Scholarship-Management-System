<?php

declare(strict_types=1);

namespace App\Persistence;

use App\Domain\Data\NeedApplication;
use App\Domain\Data\Screening;
use App\Domain\Data\Student;

/**
 * One reviewed application: what was asked, by whom, and what the filter made
 * of it.
 *
 * Lives here rather than in App\Domain\Data because it is not part of the
 * domain — its TypeScript counterpart is a type inside useApplications.ts, a
 * hook, not inside types.ts. It is the shape this layer hands upwards, and
 * Phase 8 turns it into JSON.
 */
final readonly class ScreenedApplication
{
    public function __construct(
        public NeedApplication $application,
        public Student $student,
        /** Tuition already covered by other scholarships, as a percentage. */
        public float $existingCoveragePct,
        public Screening $screening,
    ) {}
}
