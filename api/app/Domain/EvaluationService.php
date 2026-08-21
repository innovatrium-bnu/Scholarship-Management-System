<?php

declare(strict_types=1);

namespace App\Domain;

use App\Domain\Data\Award;
use App\Domain\Data\EvalResult;
use App\Domain\Data\Rule;
use App\Domain\Data\Scholarship;
use App\Domain\Data\Student;
use App\Domain\Support\JsNumber;

/**
 * Who qualifies for a scholarship. A port of src/lib/scholarship/evaluate.ts.
 *
 * Produces one verdict per student, in three flavours that mean different
 * things to whoever is running the assignment:
 *
 *   Eligible            - the rules are satisfied, go ahead
 *   PendingVerification - a human has to tick something first
 *   NotEligible         - a rule says no
 *   AlreadyHolds        - not a verdict at all; they already have this one
 *
 * The distinction between PendingVerification and NotEligible is the whole
 * point of the Manual rule kind: an unticked verification box is not a
 * rejection, it is unfinished work, and collapsing the two would quietly turn
 * administrative backlog into denied scholarships.
 */
final class EvaluationService
{
    /**
     * @param  Student[]  $students  Who to produce a verdict for.
     * @param  Award[]  $existingAwards
     * @param  Student[]  $rankingPopulation  Defaults to $students. See below.
     * @return EvalResult[]
     */
    public function evaluate(
        Scholarship $scholarship,
        array $students,
        array $existingAwards,
        ?array $rankingPopulation = null,
    ): array {
        $rankingPopulation ??= $students;

        $held = [];
        foreach ($existingAwards as $award) {
            if ($award->scholarshipId === $scholarship->id && $award->status === Award::STATUS_ACTIVE) {
                $held[$award->studentRegNo] = true;
            }
        }

        /**
         * Cohort-rank rules rank against the full cohort that passes scope, not
         * against whichever subset is being targeted by this assignment run.
         *
         * This matters when targeting one student: they must be ranked against
         * their whole cohort, not against a population of one — where everybody
         * is, trivially, in the top 1%.
         */
        $rankMap = [];
        $cohortRule = null;
        foreach ($scholarship->awardRules as $rule) {
            if ($rule->kind === Rule::KIND_COHORT_RANK) {
                $cohortRule = $rule;
                break;
            }
        }

        if ($cohortRule !== null) {
            $eligibleForRanking = array_values(array_filter(
                $rankingPopulation,
                fn (Student $s) => $this->scopeFailure($scholarship, $s) === null,
            ));

            usort($eligibleForRanking, fn (Student $a, Student $b) => $b->cgpa <=> $a->cgpa);

            $count = count($eligibleForRanking);
            foreach ($eligibleForRanking as $i => $s) {
                $percentile = $count > 0 ? (($i + 1) / $count) * 100 : 100;
                $rankMap[$s->regNo] = [
                    'rank' => $i + 1,
                    'percentile' => round($percentile * 10) / 10,
                ];
            }
        }

        $results = [];
        foreach ($students as $student) {
            $results[] = $this->evaluateOne($scholarship, $student, $held, $rankMap);
        }

        return $results;
    }

    /**
     * @param  array<string,bool>  $held
     * @param  array<string,array{rank:int,percentile:float}>  $rankMap
     */
    private function evaluateOne(
        Scholarship $scholarship,
        Student $student,
        array $held,
        array $rankMap,
    ): EvalResult {
        if (isset($held[$student->regNo])) {
            return new EvalResult($student, EvalResult::ALREADY_HOLDS, ['Already holds this scholarship']);
        }

        $reasons = [];
        $notEligible = false;
        $pending = false;

        $scopeFail = $this->scopeFailure($scholarship, $student);
        if ($scopeFail !== null) {
            $notEligible = true;
            $reasons[] = $scopeFail;
        }

        foreach ($scholarship->awardRules as $rule) {
            if ($rule->kind === Rule::KIND_AUTOMATIC) {
                [$pass, $label] = $this->passesAutomatic($rule, $student);
                if (! $pass) {
                    $notEligible = true;
                    $reasons[] = $label;
                }
            } elseif ($rule->kind === Rule::KIND_MANUAL) {
                $manual = $this->manualLabel($rule->description ?? '');
                if ($manual !== null) {
                    if (! $student->flag($manual['field'])) {
                        $pending = true;
                        $reasons[] = $manual['label'].' required';
                    }
                } else {
                    // An unrecognised manual rule still needs a human. Passing
                    // it silently would be the one failure mode worth avoiding.
                    $pending = true;
                    $reasons[] = $rule->description ?? 'Manual verification required';
                }
            } elseif ($rule->kind === Rule::KIND_COHORT_RANK) {
                $info = $rankMap[$student->regNo] ?? null;
                $pct = $rule->percentile ?? 100;
                if ($info === null) {
                    $notEligible = true;
                    $reasons[] = 'Outside targeted cohort';
                } elseif ($info['percentile'] > $pct) {
                    $notEligible = true;
                    $reasons[] = sprintf(
                        'Rank %d (%s%%) is outside top %s%%',
                        $info['rank'],
                        sprintf('%.1f', $info['percentile']),
                        $this->numberText($pct),
                    );
                }
            }
        }

        $info = $rankMap[$student->regNo] ?? null;
        $rank = $info['rank'] ?? null;
        $percentile = $info['percentile'] ?? null;

        if ($notEligible) {
            return new EvalResult($student, EvalResult::NOT_ELIGIBLE, $reasons, $rank, $percentile);
        }

        if ($pending) {
            return new EvalResult($student, EvalResult::PENDING_VERIFICATION, $reasons, $rank, $percentile);
        }

        return new EvalResult($student, EvalResult::ELIGIBLE, [], $rank, $percentile);
    }

    /**
     * Why this student is out of the scholarship's reach, or null if they are
     * not. An empty list on any dimension means "no restriction", not "nobody".
     */
    private function scopeFailure(Scholarship $scholarship, Student $student): ?string
    {
        if ($scholarship->studyLevel !== 'Both' && $scholarship->studyLevel !== $student->studyLevel) {
            return "Study level (requires {$scholarship->studyLevel})";
        }

        if ($scholarship->schools !== [] && ! in_array($student->school, $scholarship->schools, true)) {
            return 'School not eligible (requires one of '.implode(', ', $scholarship->schools).')';
        }

        if ($scholarship->programmes !== [] && ! in_array($student->programme, $scholarship->programmes, true)) {
            return 'Programme not eligible (requires one of '.implode(', ', $scholarship->programmes).')';
        }

        if ($scholarship->batches !== [] && ! in_array($student->batch, $scholarship->batches, true)) {
            return 'Batch not eligible';
        }

        return null;
    }

    /**
     * Test one Automatic rule.
     *
     * The structured path — field, operator, numeric threshold — is the one
     * that is meant to be used. The description heuristic below it exists
     * because rules created before the structured fields existed carry their
     * condition only as English prose, and reading a threshold out of that
     * prose beats ignoring the rule entirely. A rule this cannot interpret
     * passes: an unreadable condition must not silently deny a scholarship.
     *
     * @return array{0: bool, 1: string}
     */
    private function passesAutomatic(Rule $rule, Student $student): array
    {
        $label = $rule->description ?: trim(
            ($rule->field ?? '').' '.($rule->operator ?? '').' '.
            ($rule->threshold === null ? '' : $this->numberText($rule->threshold))
        );

        if ($rule->field === 'cgpa' && is_numeric($rule->threshold) && ! is_string($rule->threshold)) {
            $threshold = (float) $rule->threshold;
            $shown = $this->numberText($rule->threshold);

            if ($rule->operator === '>=') {
                return [
                    $student->cgpa >= $threshold,
                    sprintf('CGPA %.2f is below the required %s', $student->cgpa, $shown),
                ];
            }

            if ($rule->operator === '>') {
                return [
                    $student->cgpa > $threshold,
                    sprintf('CGPA %.2f must exceed %s', $student->cgpa, $shown),
                ];
            }
        }

        $description = mb_strtolower($rule->description ?? '');
        if (str_contains($description, 'cgpa')) {
            $threshold = preg_match('/([0-9]+(?:\.[0-9]+)?)/', $description, $m)
                ? (float) $m[1]
                : 3.0;

            return [
                $student->cgpa >= $threshold,
                sprintf('CGPA %.2f is below the required %s', $student->cgpa, $this->numberText($threshold)),
            ];
        }

        return [true, $label];
    }

    /**
     * Map a Manual rule's prose onto the verification flag it is asking about.
     *
     * Null means the prose was not recognised, which the caller treats as
     * "needs a human" rather than as a pass.
     *
     * @return array{field: string, label: string}|null
     */
    private function manualLabel(string $description): ?array
    {
        $d = mb_strtolower($description);

        if (str_contains($d, 'financial') || str_contains($d, 'need')) {
            return ['field' => 'financialNeedVerified', 'label' => 'Financial need verification'];
        }

        if (str_contains($d, 'personal statement')) {
            return ['field' => 'personalStatementOk', 'label' => 'Personal statement review'];
        }

        if (str_contains($d, 'sport')) {
            return ['field' => 'hasSportsMedal', 'label' => 'Sports medal verification'];
        }

        if (str_contains($d, 'bfit') || str_contains($d, 'b.fit')) {
            return ['field' => 'bfitMember', 'label' => 'B.Fit membership'];
        }

        return null;
    }

    /** @see JsNumber for why the obvious cast is not good enough. */
    private function numberText(string|int|float $value): string
    {
        return JsNumber::text($value);
    }
}
