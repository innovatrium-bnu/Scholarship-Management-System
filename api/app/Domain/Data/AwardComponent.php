<?php

declare(strict_types=1);

namespace App\Domain\Data;

/**
 * One fee head on one award.
 *
 * Mirrors AwardComponent in src/lib/scholarship/types.ts.
 *
 * `entitlement` is what the scholarship promises; `applied` is what survived
 * the merge against the 100% ceiling. Both are stored rather than recomputed
 * on read, so a historical award still shows the amount actually granted even
 * after precedence has been reordered underneath it.
 */
final readonly class AwardComponent
{
    public function __construct(
        public string $feeHead,
        /** Percent for percentage lines, PKR for fixed-amount lines. */
        public float $entitlement,
        /** Percentage | Full waiver | Fixed amount */
        public string $entitlementKind,
        public float $entitlementValue,
        /** Percent (0-100) after merge for percentage lines, PKR for fixed. */
        public float $applied,
        /**
         * A pinned line. Pinned components are honoured first and consume the
         * ceiling before anything else is considered, which is how a
         * hand-agreed amount survives a scholarship that would outrank it.
         */
        public bool $isOverridden = false,
        public ?string $overrideReason = null,
        public ?string $overrideAuthority = null,
    ) {}
}
