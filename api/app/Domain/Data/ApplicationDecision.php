<?php

declare(strict_types=1);

namespace App\Domain\Data;

/**
 * The decision taken on an application.
 *
 * Approving creates the award in the same transaction, and `awardId` is what
 * ties the two together afterwards — so the decision and the money can never
 * disagree about whether a student was given anything.
 */
final readonly class ApplicationDecision
{
    public function __construct(
        /** Approved | Rejected | On hold */
        public string $outcome,
        public string $by,
        public string $role,
        public string $at,
        public string $reason,
        /** True when the criteria filter decided it rather than a person. */
        public bool $automatic = false,
        /** Tuition percentage granted. Only meaningful when approved. */
        public ?float $awardedPct = null,
        public ?string $awardId = null,
    ) {}
}
