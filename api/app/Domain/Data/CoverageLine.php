<?php

declare(strict_types=1);

namespace App\Domain\Data;

/**
 * What a scholarship pays against one fee head.
 *
 * Mirrors CoverageLine in src/lib/scholarship/types.ts.
 */
final readonly class CoverageLine
{
    public const KIND_PERCENTAGE = 'Percentage';

    public const KIND_FULL_WAIVER = 'Full waiver';

    public const KIND_FIXED_AMOUNT = 'Fixed amount';

    public function __construct(
        public string $id,
        public string $feeHead,
        /** Percentage | Full waiver | Fixed amount */
        public string $benefitKind,
        /** Percent for Percentage, PKR for Fixed amount, ignored for Full waiver. */
        public float $value,
        public ?string $conditionalOn = null,
    ) {}
}
