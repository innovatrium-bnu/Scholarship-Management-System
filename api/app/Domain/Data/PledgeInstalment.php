<?php

declare(strict_types=1);

namespace App\Domain\Data;

/**
 * One dated expectation of money.
 *
 * Mirrors PledgeInstalment in src/lib/scholarship/types.ts.
 *
 * Carries no received flag. Whether an instalment has arrived is a fact about
 * whether a donation points at it, and duplicating that here would be a second
 * answer to one question — the same reason the three fund states are derived
 * rather than stored.
 */
final readonly class PledgeInstalment
{
    public function __construct(
        public string $id,
        public int $sequence,
        public float $amount,
        /** YYYY-MM-DD */
        public string $dueOn,
    ) {}
}
