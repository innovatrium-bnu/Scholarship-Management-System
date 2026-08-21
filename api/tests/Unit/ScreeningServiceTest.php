<?php

declare(strict_types=1);

/**
 * A mirror of src/lib/scholarship/screening.test.ts, case for case.
 */

use App\Domain\Data\ApplicationDocument;
use App\Domain\Data\CgpaThreshold;
use App\Domain\ScreeningService;

/** The context for a student with no other coverage and no earlier application. */
const NONE = ['existingCoveragePct' => 0.0];

beforeEach(function () {
    $this->screening = new ScreeningService;
});

describe('minCgpaFor — thresholds run onwards from their batch', function () {
    beforeEach(function () {
        $this->thresholds = [
            new CgpaThreshold('a', 'Fall 2023', 2.5),
            new CgpaThreshold('b', 'Fall 2024', 2.65),
        ];
    });

    it('uses the threshold for the exact batch it names', function () {
        expect($this->screening->minCgpaFor('Fall 2023', $this->thresholds))->toBe(2.5);
        expect($this->screening->minCgpaFor('Fall 2024', $this->thresholds))->toBe(2.65);
    });

    it('carries a threshold forward to later batches with no rule of their own', function () {
        expect($this->screening->minCgpaFor('Spring 2024', $this->thresholds))->toBe(2.5);
        expect($this->screening->minCgpaFor('Spring 2025', $this->thresholds))->toBe(2.65);
        expect($this->screening->minCgpaFor('Fall 2025', $this->thresholds))->toBe(2.65);
    });

    it('returns null for intakes older than every threshold', function () {
        expect($this->screening->minCgpaFor('Fall 2022', $this->thresholds))->toBeNull();
        expect($this->screening->minCgpaFor('Fall 2021', $this->thresholds))->toBeNull();
    });

    it('returns null for a batch it does not recognise', function () {
        expect($this->screening->minCgpaFor('Fall 2099', $this->thresholds))->toBeNull();
    });

    it('takes the latest applicable threshold when they are listed out of order', function () {
        $jumbled = [
            new CgpaThreshold('b', 'Fall 2024', 2.65),
            new CgpaThreshold('a', 'Fall 2023', 2.5),
        ];

        expect($this->screening->minCgpaFor('Fall 2025', $jumbled))->toBe(2.65);
    });

    it('has no requirement when no thresholds are configured', function () {
        expect($this->screening->minCgpaFor('Fall 2025', []))->toBeNull();
    });
});

describe("screen — CGPA against the student's own intake", function () {
    it('passes a Fall 2024 student at exactly 2.65', function () {
        $result = $this->screening->screen(
            makeApplication(),
            makeStudent(['batch' => 'Fall 2024', 'cgpa' => 2.65]),
            makeCriteria(),
            NONE,
        );

        expect($result->checkFor('cgpa')->outcome)->toBe('Pass');
        expect($result->verdict)->toBe('Meets criteria');
    });

    it('fails a Fall 2024 student at 2.60, which the Fall 2023 intake would have passed', function () {
        $criteria = makeCriteria();

        $result = $this->screening->screen(
            makeApplication(), makeStudent(['batch' => 'Fall 2024', 'cgpa' => 2.6]), $criteria, NONE
        );
        expect($result->verdict)->toBe('Fails criteria');
        expect($result->checkFor('cgpa')->detail)->toContain('2.65');

        $older = $this->screening->screen(
            makeApplication(), makeStudent(['batch' => 'Fall 2023', 'cgpa' => 2.6]), $criteria, NONE
        );
        expect($older->verdict)->toBe('Meets criteria');
    });

    it('does not check CGPA at all for an intake with no threshold', function () {
        $result = $this->screening->screen(
            makeApplication(),
            makeStudent(['batch' => 'Fall 2022', 'cgpa' => 2.0]),
            makeCriteria(),
            NONE,
        );

        expect($result->checkFor('cgpa')->outcome)->toBe('Not applicable');
        expect($result->verdict)->toBe('Meets criteria');
    });
});

describe('screen — the other hard criteria', function () {
    it('fails an income above the ceiling', function () {
        $app = makeApplication(['household' => makeHousehold(['monthlyIncome' => 400000.0])]);

        $result = $this->screening->screen($app, makeStudent(), makeCriteria(), NONE);

        expect($result->checkFor('income')->outcome)->toBe('Fail');
        expect($result->verdict)->toBe('Fails criteria');
    });

    it('passes an income sitting exactly on the ceiling', function () {
        $app = makeApplication(['household' => makeHousehold(['monthlyIncome' => 150000.0])]);

        expect($this->screening->screen($app, makeStudent(), makeCriteria(), NONE)->verdict)
            ->toBe('Meets criteria');
    });

    it('fails a part-time credit load', function () {
        $result = $this->screening->screen(
            makeApplication(), makeStudent(['creditHours' => 9]), makeCriteria(), NONE
        );

        expect($result->checkFor('creditHours')->outcome)->toBe('Fail');
        expect($result->verdict)->toBe('Fails criteria');
    });

    it('fails and names every missing document', function () {
        $app = makeApplication(['documents' => []]);

        $result = $this->screening->screen($app, makeStudent(), makeCriteria(), NONE);

        expect($result->checkFor('documents')->outcome)->toBe('Fail');
        expect($result->checkFor('documents')->detail)->toContain('cnic');
        expect($result->checkFor('documents')->detail)->toContain('income certificate');
    });

    it('fails a second live application for the same scholarship and term', function () {
        $result = $this->screening->screen(makeApplication(), makeStudent(), makeCriteria(), [
            'existingCoveragePct' => 0.0,
            'duplicateOf' => 'app-earlier',
        ]);

        expect($result->checkFor('duplicate')->outcome)->toBe('Fail');
        expect($result->verdict)->toBe('Fails criteria');
    });
});

describe('screen — flags are not rejections', function () {
    it('only flags attendance, which is not in the auto-reject list', function () {
        $result = $this->screening->screen(
            makeApplication(), makeStudent(['attendancePct' => 40.0]), makeCriteria(), NONE
        );

        expect($result->checkFor('attendance')->outcome)->toBe('Fail');
        expect($result->verdict)->toBe('Needs a closer look');
        expect($result->blockers)->toHaveCount(0);
        expect(array_map(fn ($f) => $f->id, $result->flags))->toBe(['attendance']);
    });

    it('only flags heavy existing coverage', function () {
        $result = $this->screening->screen(
            makeApplication(), makeStudent(), makeCriteria(), ['existingCoveragePct' => 75.0]
        );

        expect($result->verdict)->toBe('Needs a closer look');
        expect(array_map(fn ($f) => $f->id, $result->flags))->toBe(['existingCoverage']);
    });

    it('lets a blocker outrank a flag', function () {
        $result = $this->screening->screen(
            makeApplication(),
            makeStudent(['cgpa' => 1.9, 'attendancePct' => 40.0]),
            makeCriteria(),
            NONE,
        );

        expect($result->verdict)->toBe('Fails criteria');
        expect(array_map(fn ($b) => $b->id, $result->blockers))->toBe(['cgpa']);
        expect(array_map(fn ($f) => $f->id, $result->flags))->toBe(['attendance']);
    });
});

describe('screen — autoRejectOn decides how aggressive the filter is', function () {
    it('downgrades a CGPA failure to a flag when CGPA is taken off the list', function () {
        $criteria = makeCriteria(['autoRejectOn' => ['income', 'documents']]);

        $result = $this->screening->screen(
            makeApplication(), makeStudent(['cgpa' => 1.5]), $criteria, NONE
        );

        expect($result->checkFor('cgpa')->outcome)->toBe('Fail');
        expect($result->verdict)->toBe('Needs a closer look');
    });

    it('promotes attendance to a blocker when it is added to the list', function () {
        $criteria = makeCriteria(['autoRejectOn' => ['attendance']]);

        $result = $this->screening->screen(
            makeApplication(), makeStudent(['attendancePct' => 40.0]), $criteria, NONE
        );

        expect($result->verdict)->toBe('Fails criteria');
        expect(array_map(fn ($b) => $b->id, $result->blockers))->toBe(['attendance']);
    });

    it('never rejects anything when the list is empty', function () {
        $criteria = makeCriteria(['autoRejectOn' => []]);
        $app = makeApplication([
            'documents' => [],
            'household' => makeHousehold(['monthlyIncome' => 900000.0]),
        ]);

        $result = $this->screening->screen(
            $app, makeStudent(['cgpa' => 1.2, 'creditHours' => 3]), $criteria, NONE
        );

        expect($result->verdict)->toBe('Needs a closer look');
        expect($result->blockers)->toHaveCount(0);
    });
});

describe('screen — the recorded rejection reason', function () {
    it('is empty when nothing blocks', function () {
        expect($this->screening->screen(makeApplication(), makeStudent(), makeCriteria(), NONE)
            ->rejectionReason)->toBe('');
    });

    it('names every blocking criterion, and no flags', function () {
        $app = makeApplication(['documents' => []]);

        $result = $this->screening->screen(
            $app, makeStudent(['cgpa' => 1.5, 'attendancePct' => 10.0]), makeCriteria(), NONE
        );

        expect($result->rejectionReason)->toContain('CGPA 1.50');
        expect($result->rejectionReason)->toContain('Missing');
        expect($result->rejectionReason)->not->toContain('Attendance');
        expect(str_ends_with($result->rejectionReason, '.'))->toBeTrue();
    });
});

describe('missingDocuments', function () {
    it('lists only what is absent, keeping the criteria order', function () {
        $app = makeApplication(['documents' => [
            new ApplicationDocument('d', 'Fee voucher', 'f.pdf', '2025-08-01', false),
        ]]);

        expect($this->screening->missingDocuments($app, ['CNIC', 'Fee voucher', 'Income certificate']))
            ->toBe(['CNIC', 'Income certificate']);
    });

    it('is empty when nothing is required', function () {
        expect($this->screening->missingDocuments(makeApplication(), []))->toBe([]);
    });
});
