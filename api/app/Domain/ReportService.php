<?php

declare(strict_types=1);

namespace App\Domain;

use App\Domain\Data\Award;
use App\Domain\Data\DomainEvent;
use App\Domain\Data\Scholarship;
use App\Domain\Data\Student;

/**
 * Institution-wide counts. A port of src/lib/scholarship/aggregate.ts.
 *
 * These were `useMemo` blocks inside the dashboard route, which meant nothing
 * could test them and two of them were quietly wrong:
 *
 *  - "Taken back this year" counted awards by the date the award *started*, so
 *    it reported awards that began this year and happened to be revoked — at
 *    any time, including years later.
 *  - "Scholars over time" resolved a year to a batch by taking the first match,
 *    so with both "Spring 2025" and "Fall 2025" on the list it silently dropped
 *    an entire cohort.
 *
 * Both are the sort of error nobody notices, because a plausible number is
 * indistinguishable from a correct one at a glance. The tests below are what
 * makes them stay fixed.
 */
final class ReportService
{
    public function __construct(private MergeService $merge = new MergeService) {}

    /**
     * Registration numbers holding at least one active award.
     *
     * @param  Award[]  $awards
     * @return string[] Unique, in first-seen order.
     */
    public function scholarRegNos(array $awards): array
    {
        $regNos = [];
        foreach ($awards as $award) {
            if ($award->status === Award::STATUS_ACTIVE) {
                $regNos[$award->studentRegNo] = true;
            }
        }

        return array_keys($regNos);
    }

    /**
     * Total fee relief in PKR, after the merge engine has applied precedence
     * and the 100% ceiling.
     *
     * Goes through the merge rather than summing entitlements, which is the
     * difference between reporting what the university actually forgoes and
     * reporting the sum of every promise made.
     *
     * @param  iterable<string>  $regNos
     * @param  Student[]  $students
     * @param  Award[]  $awards
     * @param  Scholarship[]  $scholarships  In precedence order.
     */
    public function totalWaiverPKR(
        iterable $regNos,
        array $students,
        array $awards,
        array $scholarships,
    ): float {
        $byReg = [];
        foreach ($students as $student) {
            $byReg[$student->regNo] = $student;
        }

        $total = 0.0;
        foreach ($regNos as $regNo) {
            $student = $byReg[$regNo] ?? null;
            if ($student === null) {
                continue;
            }

            $active = array_values(array_filter(
                $awards,
                fn (Award $a) => $a->studentRegNo === $regNo && $a->status === Award::STATUS_ACTIVE,
            ));

            $total += $this->merge->waiverValuePKR(
                $student,
                $this->merge->computeMerge($student, $active, $scholarships),
            );
        }

        return $total;
    }

    /**
     * Awards revoked within a date range, counted from the revocation rather
     * than from when the award began.
     *
     * Reads the event log rather than the awards themselves, because an award
     * can end without surviving as a row: undoing a batch deletes its awards
     * outright. Undone batches are excluded — those students never really held
     * the scholarship, so counting them as losses would overstate every figure.
     *
     * @param  DomainEvent[]  $events
     * @return DomainEvent[]
     */
    public function awardsRevokedBetween(array $events, string $from, string $to): array
    {
        return $this->grantsOrRevocationsBetween($events, DomainEvent::AWARD_REVOKED, $from, $to);
    }

    /**
     * Awards granted within a date range, on the same terms.
     *
     * @param  DomainEvent[]  $events
     * @return DomainEvent[]
     */
    public function awardsGrantedBetween(array $events, string $from, string $to): array
    {
        return $this->grantsOrRevocationsBetween($events, DomainEvent::AWARD_GRANTED, $from, $to);
    }

    /**
     * @param  DomainEvent[]  $events
     * @return DomainEvent[]
     */
    private function grantsOrRevocationsBetween(
        array $events,
        string $kind,
        string $from,
        string $to,
    ): array {
        $undone = $this->undoneAwardIds($events);

        return array_values(array_filter($events, function (DomainEvent $e) use ($kind, $undone, $from, $to) {
            if ($e->kind !== $kind || isset($undone[$e->awardId])) {
                return false;
            }

            // ISO-8601 dates sort lexicographically, which is the whole reason
            // they are stored as strings. strcmp rather than >= because PHP
            // compares two numeric-looking strings as numbers, and a date that
            // lost its dashes would silently start comparing as an integer.
            return strcmp((string) $e->effectiveFrom, $from) >= 0
                && strcmp((string) $e->effectiveFrom, $to) <= 0;
        }));
    }

    /**
     * Grants and revocations per term, for the dashboard's movement chart.
     *
     * @param  DomainEvent[]  $events
     * @param  string[]  $semesters
     * @return array<int, array{semester: string, gained: int, lost: int}>
     */
    public function grantedAndRevokedBySemester(array $events, array $semesters): array
    {
        $undone = $this->undoneAwardIds($events);

        $count = function (string $kind, string $semester) use ($events, $undone): int {
            $n = 0;
            foreach ($events as $e) {
                if ($e->kind === $kind && ! isset($undone[$e->awardId]) && $e->semester === $semester) {
                    $n++;
                }
            }

            return $n;
        };

        $rows = [];
        foreach ($semesters as $semester) {
            // A term with no movement gets a zero row, not a missing one: a gap
            // in a chart reads as "no data", which is a different claim.
            $rows[] = [
                'semester' => $semester,
                'gained' => $count(DomainEvent::AWARD_GRANTED, $semester),
                'lost' => $count(DomainEvent::AWARD_REVOKED, $semester),
            ];
        }

        return $rows;
    }

    /**
     * Scholarship holders by intake year.
     *
     * A year covers *every* batch ending in it. The Spring and Fall intakes of
     * one year are two separate cohorts, and counting only the first found is
     * how the old version lost half its students.
     *
     * @param  Award[]  $awards
     * @param  Student[]  $students
     * @param  string[]  $batches
     * @param  string[]  $years
     * @return array<int, array{year: string, scholars: int}>
     */
    public function scholarsByIntakeYear(
        array $awards,
        array $students,
        array $batches,
        array $years,
    ): array {
        $holders = $this->scholarRegNos($awards);

        $byReg = [];
        foreach ($students as $student) {
            $byReg[$student->regNo] = $student;
        }

        $rows = [];
        foreach ($years as $year) {
            $inYear = [];
            foreach ($batches as $batch) {
                if (str_ends_with($batch, $year)) {
                    $inYear[$batch] = true;
                }
            }

            $count = 0;
            foreach ($holders as $regNo) {
                $student = $byReg[$regNo] ?? null;
                if ($student !== null && isset($inYear[$student->batch])) {
                    $count++;
                }
            }

            $rows[] = ['year' => $year, 'scholars' => $count];
        }

        return $rows;
    }

    /**
     * Awards whose batch was undone, keyed for lookup.
     *
     * @param  DomainEvent[]  $events
     * @return array<string,bool>
     */
    private function undoneAwardIds(array $events): array
    {
        $undone = [];
        foreach ($events as $event) {
            if ($event->kind === DomainEvent::AWARD_UNDONE && $event->awardId !== null) {
                $undone[$event->awardId] = true;
            }
        }

        return $undone;
    }
}
