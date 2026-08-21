<?php

declare(strict_types=1);

namespace App\Persistence;

use App\Domain\Data\Award;
use App\Domain\Data\EvalResult;
use App\Domain\EvaluationService;
use App\Models\Scholarship;
use App\Persistence\Repositories\AwardRepository;
use App\Persistence\Repositories\ScholarshipRepository;
use App\Persistence\Repositories\StudentRepository;

/**
 * What may not be granted, and why.
 *
 * The assign screen already answers this before it posts — it filters
 * AlreadyHolds out of the candidate list and hides retired scholarships from
 * the picker. None of that was enforced anywhere else, so the answers were only
 * as good as the client asking the question. Three things got through:
 *
 *   - the same scholarship granted twice to one student, which the merge then
 *     treats as two competing claims and pays both, so a 50% scholarship pays
 *     90%;
 *   - a student the evaluation had just called NotEligible, granted in the mode
 *     literally named "Evaluate";
 *   - an archived scholarship, which is the one thing archiving is supposed to
 *     prevent.
 *
 * It sits in the persistence layer rather than the controller because the
 * question needs rows — who holds what, who is enrolled, how the cohort ranks —
 * and EvaluationService must stay pure. Same shape as ApplicationScreener: the
 * queries live here, the judgement stays in the domain.
 *
 * Direct mode is deliberately still allowed to override eligibility. That is
 * what it is for — a committee grants an award against the rules, on someone's
 * authority, with a reason recorded. What it is not for is granting a second
 * copy of an award the student already holds, or spending a retired
 * scholarship, neither of which anybody chose.
 */
final class AssignmentGuard
{
    public const MODE_EVALUATE = 'Evaluate';

    public function __construct(
        private readonly ScholarshipRepository $scholarships,
        private readonly StudentRepository $students,
        private readonly AwardRepository $awards,
        private readonly EvaluationService $evaluation = new EvaluationService,
    ) {}

    /**
     * Why this scholarship cannot be handed out at all, or null if it can.
     */
    public function refusesScholarship(Scholarship $scholarship): ?string
    {
        if ($scholarship->status === 'Archived') {
            return 'This scholarship is archived and can no longer be given out. '
                .'Restore it first if it should be.';
        }

        return null;
    }

    /**
     * One message per pick that must not be granted, keyed by its index.
     *
     * Keyed by index rather than by registration number so the response can be
     * merged into a validation error bag the client already knows how to read:
     * "picks.3.studentRegNo" points at the row the operator is looking at.
     *
     * @param  string[]  $regNos  in the order they were sent
     * @return array<int, string>
     */
    public function refusals(Scholarship $scholarship, array $regNos, string $mode): array
    {
        if ($regNos === []) {
            return [];
        }

        $refusals = [];

        // Who already holds it. One query, and it is the same one the
        // evaluation needs, so it is done here and handed over.
        $held = [];
        $existing = $this->awards->activeForScholarship($scholarship->id);

        foreach ($existing as $award) {
            $held[$award->studentRegNo] = true;
        }

        /*
         * Two sources of the same collision, and both have to be caught here.
         *
         * The first is a student who already holds the scholarship. The second
         * is one named twice in this batch -- which the held[] check cannot
         * see, because neither award exists yet when it runs. The unique index
         * still refuses the second insert, so no student is ever paid twice,
         * but the caller gets ORA-00001 as a 500 rather than a message naming
         * the row. Duplicates within the batch are therefore counted as they
         * are walked.
         *
         * Refused rather than silently deduplicated: two entries for one
         * student carry two sets of components, and picking one of them on the
         * operator's behalf is a decision about money that nobody made.
         */
        $seen = [];

        foreach ($regNos as $index => $regNo) {
            if (isset($held[$regNo])) {
                $refusals[$index] = 'This student already holds an active '
                    .$scholarship->name.'. Revoke it before granting another.';
            } elseif (isset($seen[$regNo])) {
                $refusals[$index] = 'This student appears more than once in this batch. '
                    .'Remove the duplicate and keep the row with the right amounts.';
            }

            $seen[$regNo] = true;
        }

        if ($mode !== self::MODE_EVALUATE) {
            return $refusals;
        }

        foreach ($this->evaluateFor($scholarship, $regNos, $existing) as $regNo => $result) {
            if ($result->status !== EvalResult::NOT_ELIGIBLE) {
                continue;
            }

            foreach ($regNos as $index => $candidate) {
                if ($candidate === $regNo && ! isset($refusals[$index])) {
                    $refusals[$index] = 'This student does not qualify: '
                        .implode('; ', $result->reasons)
                        .'. Use Direct mode with a reason to override.';
                }
            }
        }

        return $refusals;
    }

    /**
     * Run the same evaluation the assign screen ran, over the picked students.
     *
     * The ranking population is every enrolled student, always — the same rule
     * EligibilityController states: a cohort rank rule ranks against the whole
     * cohort, or targeting one student puts them in the top 1% of a population
     * of one.
     *
     * @param  string[]  $regNos
     * @param  Award[]  $existing
     * @return array<string, EvalResult>
     */
    private function evaluateFor(Scholarship $scholarship, array $regNos, array $existing): array
    {
        $domain = $this->scholarships->find($scholarship->id);

        if ($domain === null) {
            return [];
        }

        $results = $this->evaluation->evaluate(
            $domain,
            $this->students->findMany(array_values(array_unique($regNos))),
            $existing,
            $this->students->enrolled(),
        );

        $byRegNo = [];

        foreach ($results as $result) {
            $byRegNo[$result->student->regNo] = $result;
        }

        return $byRegNo;
    }
}
