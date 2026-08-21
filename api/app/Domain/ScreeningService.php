<?php

declare(strict_types=1);

namespace App\Domain;

use App\Domain\Data\CgpaThreshold;
use App\Domain\Data\CriterionCheck;
use App\Domain\Data\EligibilityCriteria;
use App\Domain\Data\NeedApplication;
use App\Domain\Data\Screening;
use App\Domain\Data\Student;
use App\Domain\Support\BatchOrder;
use App\Domain\Support\JsNumber;

/**
 * The automatic first pass over need-based applications.
 * A port of src/lib/scholarship/screening.ts.
 *
 * The committee's problem is volume: a few hundred applications arrive and a
 * large share fail a rule that needs no judgement at all — CGPA below the floor
 * for that intake, declared income over the ceiling, half the documents
 * missing. Reading those by hand is wasted effort.
 *
 * This answers one question per criterion, in plain words, and says whether the
 * failure is the kind that can be decided without a person.
 *
 * What it never does is change anything. It returns a verdict; rejecting on
 * that verdict stays an explicit action someone takes. A student is never
 * turned down by a function running quietly in the background — which is why
 * this service has no dependencies it could write through.
 */
final class ScreeningService
{
    /**
     * The minimum CGPA for a student of this intake.
     *
     * Each threshold covers its own batch and every batch after it, until a
     * later one takes over — so "2.50 from Fall 2023" and "2.65 from Fall 2024"
     * together put Spring 2024 at 2.50 and everything from Fall 2024 on at
     * 2.65.
     *
     * Null when the intake predates every threshold: no CGPA rule was ever
     * written for them, and none is invented here.
     *
     * @param  CgpaThreshold[]  $thresholds
     * @param  string[]  $batchOrder
     */
    public function minCgpaFor(
        string $batch,
        array $thresholds,
        array $batchOrder = BatchOrder::DEFAULT,
    ): ?float {
        $studentAt = array_search($batch, $batchOrder, true);
        if ($studentAt === false) {
            return null;
        }

        $best = null;
        foreach ($thresholds as $threshold) {
            $at = array_search($threshold->fromBatch, $batchOrder, true);
            if ($at === false || $at > $studentAt) {
                continue;
            }
            if ($best === null || $at > $best['at']) {
                $best = ['at' => $at, 'minCgpa' => $threshold->minCgpa];
            }
        }

        return $best === null ? null : $best['minCgpa'];
    }

    /**
     * Documents the criteria ask for that this application has not attached.
     *
     * Order follows the criteria, not the attachments, so the sentence reads in
     * the order the list was written.
     *
     * @param  string[]  $required
     * @return string[]
     */
    public function missingDocuments(NeedApplication $app, array $required): array
    {
        $attached = [];
        foreach ($app->documents as $document) {
            $attached[$document->kind] = true;
        }

        return array_values(array_filter($required, fn ($r) => ! isset($attached[$r])));
    }

    /**
     * @param  array{existingCoveragePct: float, duplicateOf?: ?string}  $context
     * @param  string[]  $batchOrder
     */
    public function screen(
        NeedApplication $app,
        Student $student,
        EligibilityCriteria $criteria,
        array $context,
        array $batchOrder = BatchOrder::DEFAULT,
    ): Screening {
        $auto = array_flip($criteria->autoRejectOn);
        $checks = [];

        $add = function (string $id, string $label, string $outcome, string $detail) use (&$checks, $auto): void {
            $checks[] = new CriterionCheck($id, $label, $outcome, $detail, isset($auto[$id]));
        };

        /* -- CGPA, by intake -------------------------------------------- */
        $minCgpa = $this->minCgpaFor($student->batch, $criteria->cgpaThresholds, $batchOrder);
        if ($minCgpa === null) {
            $add('cgpa', 'Minimum CGPA', CriterionCheck::NOT_APPLICABLE,
                "No CGPA rule has been set for the {$student->batch} intake, so this is not checked.");
        } else {
            $pass = $student->cgpa >= $minCgpa;
            $add('cgpa', 'Minimum CGPA', $pass ? CriterionCheck::PASS : CriterionCheck::FAIL,
                $pass
                    ? sprintf('CGPA %.2f meets the %.2f required of the %s intake.',
                        $student->cgpa, $minCgpa, $student->batch)
                    : sprintf('CGPA %.2f is below the %.2f required of the %s intake.',
                        $student->cgpa, $minCgpa, $student->batch));
        }

        /* -- Household income ------------------------------------------- */
        $income = $app->household->monthlyIncome;
        $pass = $income <= $criteria->maxMonthlyIncome;
        $add('income', 'Household income', $pass ? CriterionCheck::PASS : CriterionCheck::FAIL,
            $pass
                ? sprintf('Declared household income of %s a month is within the %s ceiling.',
                    $this->pkr($income), $this->pkr($criteria->maxMonthlyIncome))
                : sprintf('Declared household income of %s a month is above the %s ceiling for need-based support.',
                    $this->pkr($income), $this->pkr($criteria->maxMonthlyIncome)));

        /* -- Enrolled credit hours -------------------------------------- */
        $pass = $student->creditHours >= $criteria->minCreditHours;
        $add('creditHours', 'Credit hours enrolled', $pass ? CriterionCheck::PASS : CriterionCheck::FAIL,
            $pass
                ? "Enrolled in {$student->creditHours} credit hours, at or above the {$criteria->minCreditHours} required."
                : "Enrolled in only {$student->creditHours} credit hours; {$criteria->minCreditHours} are required to count as full-time.");

        /* -- Attendance -------------------------------------------------- */
        $pass = $student->attendancePct >= $criteria->minAttendancePct;
        $attendance = JsNumber::text($student->attendancePct);
        $minAttendance = JsNumber::text($criteria->minAttendancePct);
        $add('attendance', 'Attendance', $pass ? CriterionCheck::PASS : CriterionCheck::FAIL,
            $pass
                ? "Attendance of {$attendance}% meets the {$minAttendance}% required."
                : "Attendance of {$attendance}% is below the {$minAttendance}% required.");

        /* -- Supporting documents ---------------------------------------- */
        $missing = $this->missingDocuments($app, $criteria->requiredDocuments);
        $add('documents', 'Supporting documents',
            $missing === [] ? CriterionCheck::PASS : CriterionCheck::FAIL,
            $missing === []
                ? 'All '.count($criteria->requiredDocuments).' required documents are attached.'
                : 'Missing '.$this->sentenceList(array_map(mb_strtolower(...), $missing)).'.');

        /* -- Fee already covered ----------------------------------------- */
        $covered = $context['existingCoveragePct'];
        $pass = $covered <= $criteria->maxExistingCoveragePct;
        $coveredText = JsNumber::text($covered);
        $maxCoverage = JsNumber::text($criteria->maxExistingCoveragePct);
        $add('existingCoverage', 'Fee already covered', $pass ? CriterionCheck::PASS : CriterionCheck::FAIL,
            match (true) {
                (float) $covered === 0.0 => "No other scholarship pays towards this student's tuition.",
                $pass => "Other scholarships already pay {$coveredText}% of tuition, within the {$maxCoverage}% allowed.",
                default => "Other scholarships already pay {$coveredText}% of tuition, above the {$maxCoverage}% at which a further need award is questioned.",
            });

        /* -- Duplicate submission ---------------------------------------- */
        $duplicate = ! empty($context['duplicateOf']);
        $add('duplicate', 'Duplicate application',
            $duplicate ? CriterionCheck::FAIL : CriterionCheck::PASS,
            $duplicate
                ? "This student already has a live application for the same scholarship in {$app->semester}."
                : "This is the student's only live application for this scholarship.");

        /* -- Verdict ------------------------------------------------------ */
        $failed = array_values(array_filter($checks, fn ($c) => $c->outcome === CriterionCheck::FAIL));
        $blockers = array_values(array_filter($failed, fn ($c) => $c->autoRejects));
        $flags = array_values(array_filter($failed, fn ($c) => ! $c->autoRejects));

        $verdict = match (true) {
            $blockers !== [] => Screening::FAILS,
            $flags !== [] => Screening::NEEDS_LOOK,
            default => Screening::MEETS,
        };

        $rejectionReason = $blockers === []
            ? ''
            : 'Did not meet the eligibility criteria: '.$this->sentenceList(
                array_map(fn ($b) => preg_replace('/\.$/', '', $b->detail), $blockers)
            ).'.';

        return new Screening($verdict, $checks, $blockers, $flags, $rejectionReason);
    }

    /**
     * Rupees, grouped the way the TypeScript's toLocaleString("en-PK") groups
     * them. Verified against Node's ICU: en-PK uses Western grouping here, not
     * the Indian lakh/crore pattern, so plain thousands separators match.
     */
    private function pkr(float $amount): string
    {
        return 'PKR '.number_format($amount, 0, '.', ',');
    }

    /** @param string[] $items */
    private function sentenceList(array $items): string
    {
        if ($items === []) {
            return '';
        }
        if (count($items) === 1) {
            return $items[0];
        }

        $last = array_pop($items);

        return implode(', ', $items).' and '.$last;
    }
}
