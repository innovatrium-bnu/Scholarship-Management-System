<?php

declare(strict_types=1);

namespace App\Domain\Data;

/**
 * The thresholds the application filter applies.
 *
 * Mirrors EligibilityCriteria and CgpaThreshold in
 * src/lib/scholarship/types.ts. These are settings edited at runtime, not
 * policy compiled in.
 */
final readonly class EligibilityCriteria
{
    public function __construct(
        public string $scholarshipId,
        /** @var CgpaThreshold[] */
        public array $cgpaThresholds,
        public float $maxMonthlyIncome,
        public int $minCreditHours,
        public float $minAttendancePct,
        /** @var string[] Document kinds an application must carry. */
        public array $requiredDocuments,
        /** Applying while already covered above this much tuition is questionable. */
        public float $maxExistingCoveragePct,
        /**
         * @var string[] Which failures reject without a person looking.
         *
         * The switch that decides how aggressive the filter is. A criterion
         * left off this list still shows on the application as a flag for the
         * committee to weigh — it simply cannot reject on its own.
         */
        public array $autoRejectOn,
    ) {}
}
