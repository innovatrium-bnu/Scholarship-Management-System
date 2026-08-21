<?php

declare(strict_types=1);

namespace App\Domain\Data;

/**
 * A need-based application, and the pieces that hang off it.
 *
 * Mirrors NeedApplication, HouseholdInfo, ApplicationDocument and
 * ApplicationDecision in src/lib/scholarship/types.ts.
 *
 * Students do not log in to this system. Applications arrive from the
 * admission portal; this is the Registrar Office's review queue.
 */
final readonly class NeedApplication
{
    public function __construct(
        public string $id,
        public string $studentRegNo,
        public string $scholarshipId,
        /** The term the money is being asked for. */
        public string $semester,
        public string $submittedAt,
        public HouseholdInfo $household,
        public string $statement,
        /** @var ApplicationDocument[] */
        public array $documents,
        /** What the student asked for, as a percentage of tuition. */
        public float $requestedPct,
        /** Submitted | On hold | Approved | Rejected | Withdrawn */
        public string $status,
        public ?ApplicationDecision $decision = null,
    ) {}
}
