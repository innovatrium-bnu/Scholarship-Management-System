<?php

declare(strict_types=1);

namespace App\Domain\Data;

/**
 * A scholarship and its terms.
 *
 * Mirrors Scholarship in src/lib/scholarship/types.ts.
 *
 * Note what is absent: any notion of a version. types.ts explains why — when
 * terms change you create a second scholarship pointed at the newer batches,
 * so each one has exactly one set of terms for life.
 *
 * Note also what is absent from the *object* but present in the database:
 * precedence. In the prototype a scholarship's priority was its index in the
 * `scholarships` array, and MergeService still reads it that way — from the
 * order of the list it is handed. The database column exists to make that
 * order reproducible; it is applied by sorting the list before it gets here,
 * not by consulting a field. Keeping it out of this object means the service
 * cannot be given a correctly ordered list and a contradictory field.
 */
final readonly class Scholarship
{
    public const STATUS_ACTIVE = 'Active';

    public const STATUS_ARCHIVED = 'Archived';

    public function __construct(
        public string $id,
        public string $name,
        public string $description,
        /** Bachelors | Masters | Both */
        public string $studyLevel,
        /** @var string[] Empty means "any school". */
        public array $schools,
        /** @var string[] Empty means "any programme". */
        public array $programmes,
        /**
         * @var string[] The resolved list of batches, always kept in step with
         *               $batchMode by resolveBatches() so every matching check
         *               can just ask "is the student's batch in here?".
         */
        public array $batches,
        /** all | list | onwards */
        public string $batchMode,
        public string $semesterFrom,
        /** @var CoverageLine[] */
        public array $coverage,
        /** @var Rule[] */
        public array $awardRules,
        /** @var Rule[] */
        public array $retentionRules,
        public int $maxDurationYears,
        public int $workStudyHoursPerMonth,
        public bool $requiresReapplication,
        /** Internal | Donor */
        public string $fundingSource,
        /** Active | Archived */
        public string $status,
        public string $effectiveFrom,
        /** Every semester | Annual */
        public string $reviewCycle,
        public ?string $batchFrom = null,
        public ?string $semesterTill = null,
        public bool $allSemesters = false,
        public ?string $donorName = null,
        public ?int $quotaPerCohort = null,
        public bool $mayExceedCeiling = false,
        /**
         * The donor record funding this, once one has been matched.
         *
         * Optional and staying that way: most scholarships are internally
         * funded, and a donor-funded one created before the donors module
         * has a name and no id. donorName remains the display fallback.
         */
        public ?string $donorId = null,
    ) {}
}
