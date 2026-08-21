<?php

declare(strict_types=1);

namespace App\Domain\Data;

/**
 * A minimum CGPA that applies to one intake and every intake after it, until a
 * later threshold takes over.
 *
 * Written this way because that is how the policy is written: "2.65 for Fall
 * 2024 and onwards, 2.50 for Fall 2023".
 */
final readonly class CgpaThreshold
{
    public function __construct(
        public string $id,
        public string $fromBatch,
        public float $minCgpa,
    ) {}
}
