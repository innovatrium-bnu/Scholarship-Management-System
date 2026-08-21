<?php

declare(strict_types=1);

namespace App\Domain\Data;

/**
 * One condition on a scholarship, for award or for retention.
 *
 * Mirrors Rule in src/lib/scholarship/types.ts. The four kinds are handled by
 * EvaluationService; which fields are meaningful depends on the kind, which is
 * why nearly all of them are nullable.
 */
final readonly class Rule
{
    public const KIND_AUTOMATIC = 'Automatic';

    public const KIND_MANUAL = 'Manual';

    public const KIND_CALCULATED_SCORE = 'Calculated score';

    public const KIND_COHORT_RANK = 'Cohort rank';

    public function __construct(
        public string $id,
        /** Automatic | Manual | Calculated score | Cohort rank */
        public string $kind,
        public ?string $field = null,
        public ?string $operator = null,
        /**
         * Numeric or textual depending on the field, which is why types.ts
         * types this `string | number`. Kept as the union here: passesAutomatic
         * only takes the numeric path when it really is a number, and the
         * distinction decides which branch runs.
         */
        public string|float|int|null $threshold = null,
        public ?string $description = null,
        /** Calculated score: field name => weight. */
        public ?array $weights = null,
        /** Cohort rank: "top N percent". */
        public ?float $percentile = null,
    ) {}
}
