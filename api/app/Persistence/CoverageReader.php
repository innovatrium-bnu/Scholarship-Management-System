<?php

declare(strict_types=1);

namespace App\Persistence;

use App\Domain\Data\MergedAward;
use App\Domain\MergeService;
use App\Persistence\Repositories\AwardRepository;
use App\Persistence\Repositories\ScholarshipRepository;
use App\Persistence\Repositories\StudentRepository;

/**
 * What a student actually gets, after every award they hold is merged.
 *
 * The hottest read in the application, and the one MergeService exists for.
 * Three loads and then pure computation: the student, their active awards, and
 * every scholarship in precedence order — because the merge resolves competing
 * claims on a fee head by the order it is handed the scholarships.
 */
final class CoverageReader
{
    public function __construct(
        private readonly StudentRepository $students,
        private readonly AwardRepository $awards,
        private readonly ScholarshipRepository $scholarships,
        private readonly MergeService $merge = new MergeService,
    ) {}

    /**
     * @return MergedAward[]
     */
    public function forStudent(string $regNo): array
    {
        $student = $this->students->find($regNo);

        if ($student === null) {
            return [];
        }

        return $this->merge->computeMerge(
            $student,
            $this->awards->activeForStudent($regNo),
            $this->scholarships->all(),
        );
    }

    /**
     * The value of everything a student has been waived, in rupees.
     */
    public function waiverValueFor(string $regNo): float
    {
        $student = $this->students->find($regNo);

        if ($student === null) {
            return 0.0;
        }

        return $this->merge->waiverValuePKR($student, $this->forStudent($regNo));
    }
}
