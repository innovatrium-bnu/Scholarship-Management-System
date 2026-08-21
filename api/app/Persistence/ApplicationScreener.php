<?php

declare(strict_types=1);

namespace App\Persistence;

use App\Domain\Data\Award;
use App\Domain\Data\NeedApplication;
use App\Domain\Data\Scholarship;
use App\Domain\Data\Student;
use App\Domain\MergeService;
use App\Domain\ScreeningService;
use App\Persistence\Repositories\AwardRepository;
use App\Persistence\Repositories\NeedApplicationRepository;
use App\Persistence\Repositories\ScholarshipRepository;
use App\Persistence\Repositories\StudentRepository;

/**
 * Runs the eligibility filter over the review queue.
 *
 * This is what the persistence layer is for, and the clearest example of the
 * boundary the phase plan draws. ScreeningService::screen() takes a $context
 * carrying two facts it cannot work out for itself:
 *
 *   existingCoveragePct  how much tuition this student already has covered
 *   duplicateOf          whether they filed this same application before
 *
 * Both are questions about other rows. Answering them inside the service would
 * mean giving it a database, and the moment it has one it stops being a pure
 * function over plain values and stops matching screening.ts. So the queries
 * live here, the judgement stays there, and neither knows how the other works.
 *
 * A port of the useApplications.ts hook, which is the reference implementation
 * for both computations. Where the two differ, that file is right.
 */
final class ApplicationScreener
{
    /**
     * Statuses that still occupy a slot.
     *
     * A withdrawn or rejected application is not a duplicate of anything — the
     * student is free to apply again, which is the point.
     */
    private const LIVE = ['Submitted', 'On hold', 'Approved'];

    public function __construct(
        private readonly NeedApplicationRepository $applications,
        private readonly StudentRepository $students,
        private readonly AwardRepository $awards,
        private readonly ScholarshipRepository $scholarships,
        private readonly ScreeningService $screening = new ScreeningService,
        private readonly MergeService $merge = new MergeService,
    ) {}

    /**
     * Screen the whole queue.
     *
     * Four queries regardless of how many applications there are: the
     * applications, their students, the active awards of those students, and
     * the criteria. Everything after that happens in memory, which is what
     * keeps this from becoming the N+1 AGENTS.md warns about at 5,000 students.
     *
     * @return ScreenedApplication[]
     */
    public function screenQueue(): array
    {
        $applications = $this->applications->all();

        if ($applications === []) {
            return [];
        }

        $regNos = $this->uniqueValues($applications, fn (NeedApplication $a) => $a->studentRegNo);

        $studentsByRegNo = [];
        foreach ($this->students->findMany($regNos) as $student) {
            $studentsByRegNo[$student->regNo] = $student;
        }

        $awardsByRegNo = $this->awards->activeForStudents($regNos);

        // Precedence order, because the merge below depends on it.
        $scholarships = $this->scholarships->all();

        $criteria = $this->scholarships->criteriaByScholarship(
            $this->uniqueValues($applications, fn (NeedApplication $a) => $a->scholarshipId)
        );

        $canonical = $this->canonicalApplicationIds($applications);

        $screened = [];

        foreach ($applications as $application) {
            $student = $studentsByRegNo[$application->studentRegNo] ?? null;
            $rules = $criteria[$application->scholarshipId] ?? null;

            // The same skip the hook makes: an application whose student or
            // criteria are missing cannot be screened, and inventing either
            // would be worse than leaving it out of the queue.
            if ($student === null || $rules === null) {
                continue;
            }

            $ownAwardId = $application->decision?->awardId;

            $covered = $this->tuitionCoveredByOthers(
                $student,
                $awardsByRegNo[$application->studentRegNo] ?? [],
                $ownAwardId,
                $scholarships,
            );

            $first = $canonical[$this->duplicateKey($application)] ?? null;
            $duplicateOf = ($first !== null && $first !== $application->id) ? $first : null;

            $screened[] = new ScreenedApplication(
                application: $application,
                student: $student,
                existingCoveragePct: $covered,
                screening: $this->screening->screen($application, $student, $rules, [
                    'existingCoveragePct' => $covered,
                    'duplicateOf' => $duplicateOf,
                ]),
            );
        }

        return $screened;
    }

    /**
     * Tuition already covered, counting every award except this one.
     *
     * The exclusion is the subtle part. An approved application produces an
     * award; letting that award count towards the coverage the same application
     * is screened against would make every approved application immediately
     * look over-covered, and the duplicate-coverage criterion would start
     * flagging its own successes.
     *
     * @param  Award[]  $active
     * @param  Scholarship[]  $scholarships  in precedence order
     */
    private function tuitionCoveredByOthers(
        Student $student,
        array $active,
        ?string $ownAwardId,
        array $scholarships,
    ): float {
        $others = array_values(array_filter(
            $active,
            fn (Award $award) => $award->id !== $ownAwardId
        ));

        $covered = 0.0;

        foreach ($this->merge->computeMerge($student, $others, $scholarships) as $merged) {
            foreach ($merged->components as $component) {
                if ($component->feeHead === 'Tuition') {
                    $covered += $component->appliedPct;
                }
            }
        }

        return $covered;
    }

    /**
     * The first live application for each student, scholarship and term.
     *
     * Ordered by submission time so the one filed first is the one that
     * survives, and every later one is the duplicate. Ties break on id, which
     * is a ULID and therefore already in generation order — without that, two
     * applications submitted in the same millisecond would pick a winner by
     * whatever order the database happened to return them.
     *
     * @param  NeedApplication[]  $applications
     * @return array<string, string>
     */
    private function canonicalApplicationIds(array $applications): array
    {
        $live = array_values(array_filter(
            $applications,
            fn (NeedApplication $a) => in_array($a->status, self::LIVE, true)
        ));

        usort($live, function (NeedApplication $a, NeedApplication $b) {
            return [$a->submittedAt, $a->id] <=> [$b->submittedAt, $b->id];
        });

        $first = [];

        foreach ($live as $application) {
            $first[$this->duplicateKey($application)] ??= $application->id;
        }

        return $first;
    }

    private function duplicateKey(NeedApplication $application): string
    {
        return $application->studentRegNo.'|'.$application->scholarshipId.'|'.$application->semester;
    }

    /**
     * @param  NeedApplication[]  $applications
     * @return string[]
     */
    private function uniqueValues(array $applications, callable $of): array
    {
        return array_values(array_unique(array_map($of, $applications)));
    }
}
