<?php

declare(strict_types=1);

/**
 * A mirror of src/lib/scholarship/aggregate.test.ts, case for case.
 *
 * Two of these guard bugs that were live in the dashboard before the logic was
 * lifted out of it. The comments naming them are kept from the original: they
 * are the reason the tests exist.
 */

use App\Domain\Data\DomainEvent;
use App\Domain\ReportService;

beforeEach(function () {
    $this->reports = new ReportService;
});

function granted(array $patch = []): DomainEvent
{
    return new DomainEvent(...array_merge([
        'kind' => DomainEvent::AWARD_GRANTED,
        'at' => '2025-09-01T09:00:00.000Z',
        'actor' => 'Registrar Office',
        'awardId' => 'aw-1',
        'studentRegNo' => 'F23-0001',
        'scholarshipId' => 'sch-a',
        'effectiveFrom' => '2025-09-01',
        'semester' => 'Fall 2025',
    ], $patch));
}

function revoked(array $patch = []): DomainEvent
{
    return new DomainEvent(...array_merge([
        'kind' => DomainEvent::AWARD_REVOKED,
        'at' => '2025-09-01T11:30:00.000Z',
        'actor' => 'Registrar Office',
        'awardId' => 'aw-1',
        'studentRegNo' => 'F23-0001',
        'scholarshipId' => 'sch-a',
        'effectiveFrom' => '2025-09-01',
        'semester' => 'Fall 2025',
        'timing' => 'immediate',
        'cause' => 'Revoked by hand',
        'reason' => 'CGPA fell below the required level.',
    ], $patch));
}

describe('awardsRevokedBetween — counts when the award ended, not when it began', function () {
    /**
     * The bug this replaces: the dashboard filtered on status "Revoked" plus
     * effectiveFrom starting with "2025", where effectiveFrom is the date the
     * award *started*.
     */
    it('counts an award granted in 2024 and revoked in 2025', function () {
        $events = [
            granted(['effectiveFrom' => '2024-09-01', 'semester' => 'Fall 2024']),
            revoked(['effectiveFrom' => '2025-02-01', 'semester' => 'Spring 2025']),
        ];

        expect($this->reports->awardsRevokedBetween($events, '2025-01-01', '2025-12-31'))
            ->toHaveCount(1);
    });

    it('does not count an award granted in 2025 that is still running', function () {
        $events = [granted(['effectiveFrom' => '2025-09-01'])];

        expect($this->reports->awardsRevokedBetween($events, '2025-01-01', '2025-12-31'))
            ->toHaveCount(0);
    });

    it('does not count a revocation that falls outside the window', function () {
        $events = [revoked(['effectiveFrom' => '2024-09-01', 'semester' => 'Fall 2024'])];

        expect($this->reports->awardsRevokedBetween($events, '2025-01-01', '2025-12-31'))
            ->toHaveCount(0);
    });

    it('includes revocations sitting exactly on either boundary', function () {
        $events = [
            revoked(['awardId' => 'aw-1', 'effectiveFrom' => '2025-01-01']),
            revoked(['awardId' => 'aw-2', 'effectiveFrom' => '2025-12-31']),
        ];

        expect($this->reports->awardsRevokedBetween($events, '2025-01-01', '2025-12-31'))
            ->toHaveCount(2);
    });

    it('excludes an award whose batch was undone, because it was never really held', function () {
        $events = [
            granted(['awardId' => 'aw-9']),
            revoked(['awardId' => 'aw-9']),
            new DomainEvent(
                kind: DomainEvent::AWARD_UNDONE,
                at: '2025-09-02T10:00:00.000Z',
                actor: 'Registrar Office',
                awardId: 'aw-9',
                studentRegNo: 'F23-0001',
                scholarshipId: 'sch-a',
                batchId: 'bat-1',
            ),
        ];

        expect($this->reports->awardsRevokedBetween($events, '2025-01-01', '2025-12-31'))
            ->toHaveCount(0);
        expect($this->reports->awardsGrantedBetween($events, '2025-01-01', '2025-12-31'))
            ->toHaveCount(0);
    });
});

describe('everHeldRegNos — who has ever held it, not who holds it now', function () {
    it('includes a student whose award has since been revoked', function () {
        $events = [
            granted(['awardId' => 'aw-1', 'studentRegNo' => 'F23-0001', 'scholarshipId' => 'sch-a']),
            revoked(['awardId' => 'aw-1', 'studentRegNo' => 'F23-0001', 'scholarshipId' => 'sch-a']),
        ];

        expect($this->reports->everHeldRegNos($events, 'sch-a'))->toBe(['F23-0001']);
    });

    it('counts a student once however many awards of it they have held', function () {
        $events = [
            granted(['awardId' => 'aw-1', 'studentRegNo' => 'F23-0001', 'scholarshipId' => 'sch-a']),
            revoked(['awardId' => 'aw-1', 'studentRegNo' => 'F23-0001', 'scholarshipId' => 'sch-a']),
            granted(['awardId' => 'aw-2', 'studentRegNo' => 'F23-0001', 'scholarshipId' => 'sch-a']),
        ];

        expect($this->reports->everHeldRegNos($events, 'sch-a'))->toHaveCount(1);
    });

    it('ignores other scholarships', function () {
        $events = [
            granted(['awardId' => 'aw-1', 'studentRegNo' => 'F23-0001', 'scholarshipId' => 'sch-a']),
            granted(['awardId' => 'aw-2', 'studentRegNo' => 'F23-0002', 'scholarshipId' => 'sch-b']),
        ];

        expect($this->reports->everHeldRegNos($events, 'sch-a'))->toBe(['F23-0001']);
    });

    it('excludes an award whose batch was undone, because it was never really held', function () {
        $events = [
            granted(['awardId' => 'aw-1', 'studentRegNo' => 'F23-0001', 'scholarshipId' => 'sch-a']),
            new DomainEvent(
                kind: DomainEvent::AWARD_UNDONE,
                at: '2025-09-02T10:00:00.000Z',
                actor: 'Registrar Office',
                awardId: 'aw-1',
                studentRegNo: 'F23-0001',
                scholarshipId: 'sch-a',
                batchId: 'bat-1',
            ),
        ];

        expect($this->reports->everHeldRegNos($events, 'sch-a'))->toBe([]);
    });

    it('is empty for a scholarship nobody has ever been granted', function () {
        expect($this->reports->everHeldRegNos([], 'sch-a'))->toBe([]);
    });
});

describe('scholarsByIntakeYear — a year holds both its intakes', function () {
    /**
     * The bug this replaces: resolving a year to a batch by taking the first
     * match, so a year with a Spring and a Fall cohort reported the Spring one
     * alone.
     */
    it('counts the Spring and Fall cohorts of the same year together', function () {
        $students = [
            makeStudent(['regNo' => 'S25-0001', 'batch' => 'Spring 2025']),
            makeStudent(['regNo' => 'F25-0001', 'batch' => 'Fall 2025']),
            makeStudent(['regNo' => 'F25-0002', 'batch' => 'Fall 2025']),
        ];
        $awards = [
            makeAward(['id' => 'a1', 'studentRegNo' => 'S25-0001']),
            makeAward(['id' => 'a2', 'studentRegNo' => 'F25-0001']),
            makeAward(['id' => 'a3', 'studentRegNo' => 'F25-0002']),
        ];

        $rows = $this->reports->scholarsByIntakeYear(
            $awards, $students, ['Spring 2025', 'Fall 2025'], ['2025']
        );

        expect($rows[0]['scholars'])->toBe(3);
    });

    it('counts a student once however many awards they hold', function () {
        $students = [makeStudent(['regNo' => 'F25-0001', 'batch' => 'Fall 2025'])];
        $awards = [
            makeAward(['id' => 'a1', 'studentRegNo' => 'F25-0001', 'scholarshipId' => 'sch-a']),
            makeAward(['id' => 'a2', 'studentRegNo' => 'F25-0001', 'scholarshipId' => 'sch-b']),
        ];

        $rows = $this->reports->scholarsByIntakeYear($awards, $students, ['Fall 2025'], ['2025']);

        expect($rows[0]['scholars'])->toBe(1);
    });

    it('ignores revoked awards', function () {
        $students = [makeStudent(['regNo' => 'F25-0001', 'batch' => 'Fall 2025'])];
        $awards = [makeAward(['studentRegNo' => 'F25-0001', 'status' => 'Revoked'])];

        $rows = $this->reports->scholarsByIntakeYear($awards, $students, ['Fall 2025'], ['2025']);

        expect($rows[0]['scholars'])->toBe(0);
    });

    it('reports zero for a year with no batches rather than dropping the row', function () {
        expect($this->reports->scholarsByIntakeYear([], [], ['Fall 2025'], ['2026']))
            ->toBe([['year' => '2026', 'scholars' => 0]]);
    });
});

describe('grantedAndRevokedBySemester', function () {
    it('splits movement across terms', function () {
        $events = [
            granted(['awardId' => 'a1', 'semester' => 'Fall 2024']),
            granted(['awardId' => 'a2', 'semester' => 'Fall 2025']),
            granted(['awardId' => 'a3', 'semester' => 'Fall 2025']),
            revoked(['awardId' => 'a4', 'semester' => 'Fall 2025']),
        ];

        expect($this->reports->grantedAndRevokedBySemester($events, ['Fall 2024', 'Fall 2025']))
            ->toBe([
                ['semester' => 'Fall 2024', 'gained' => 1, 'lost' => 0],
                ['semester' => 'Fall 2025', 'gained' => 2, 'lost' => 1],
            ]);
    });

    it('returns a zero row for a term with no movement, not a missing one', function () {
        expect($this->reports->grantedAndRevokedBySemester([], ['Spring 2026']))
            ->toBe([['semester' => 'Spring 2026', 'gained' => 0, 'lost' => 0]]);
    });
});

describe('scholarRegNos and totalWaiverPKR', function () {
    it('counts only active awards, once per student', function () {
        $awards = [
            makeAward(['id' => 'a1', 'studentRegNo' => 'F23-0001']),
            makeAward(['id' => 'a2', 'studentRegNo' => 'F23-0001', 'scholarshipId' => 'sch-b']),
            makeAward(['id' => 'a3', 'studentRegNo' => 'F23-0002', 'status' => 'Revoked']),
        ];

        expect($this->reports->scholarRegNos($awards))->toBe(['F23-0001']);
    });

    it('values a waiver through the merge engine, so the ceiling is respected', function () {
        $student = makeStudent(['regNo' => 'F23-0001', 'tuitionFee' => 400000.0]);
        $scholarships = [makeScholarship(['id' => 'sch-a']), makeScholarship(['id' => 'sch-b'])];

        // 75% + 50% of the same fee head must land at 100%, not 125%.
        $awards = [
            makeAward([
                'id' => 'a1',
                'studentRegNo' => 'F23-0001',
                'scholarshipId' => 'sch-a',
                'components' => [makeComponent('Tuition', 'Percentage', 75)],
            ]),
            makeAward([
                'id' => 'a2',
                'studentRegNo' => 'F23-0001',
                'scholarshipId' => 'sch-b',
                'components' => [makeComponent('Tuition', 'Percentage', 50)],
            ]),
        ];

        expect($this->reports->totalWaiverPKR(['F23-0001'], [$student], $awards, $scholarships))
            ->toBe(400000.0);
    });

    it('is zero when a student holds nothing', function () {
        expect($this->reports->totalWaiverPKR(['F23-0001'], [makeStudent()], [], []))->toBe(0.0);
    });
});
