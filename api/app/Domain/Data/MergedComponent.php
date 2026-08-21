<?php

declare(strict_types=1);

namespace App\Domain\Data;

/**
 * One fee head of one award, after the merge has settled who gets what.
 *
 * Mirrors MergedComponent in src/lib/scholarship/types.ts. Derived, never
 * stored: this is the answer to "what does this award actually pay, given
 * everything else this student holds".
 */
final readonly class MergedComponent
{
    /** Granted in full. */
    public const STATUS_FULL = 'Full';

    /** Some of the entitlement fitted under the ceiling; the rest did not. */
    public const STATUS_TRIMMED = 'Trimmed';

    /** Nothing was left of the ceiling by the time this line was reached. */
    public const STATUS_SUPPRESSED = 'Suppressed';

    public function __construct(
        public string $feeHead,
        /** Percent (0-100). Fixed-amount lines carry 0 here and use the PKR field. */
        public float $entitlementPct,
        public float $entitlementPKR,
        public float $appliedPct,
        public float $appliedPKR,
        /** Full | Trimmed | Suppressed */
        public string $mergeStatus,
        public bool $isOverridden,
        /** Percentage | Full waiver | Fixed amount */
        public string $kind,
        public ?string $overrideReason = null,
        public ?string $overrideAuthority = null,
    ) {}
}
