<?php

declare(strict_types=1);

/**
 * A mirror of src/lib/scholarship/rates.test.ts, case for case.
 */

use App\Domain\Data\CoverageLine;
use App\Domain\Data\RatePlan;
use App\Domain\RatePlanService;

const HEADS = ['Tuition', 'Hostel', 'Mess', 'Other'];

beforeEach(function () {
    $this->rates = new RatePlanService;
    $this->empty = RatePlan::empty();

    /** Need-Based as seeded: half of tuition, and nothing else. */
    $this->need = makeScholarship([
        'id' => 'sch-need',
        'name' => 'Need-Based Scholarship',
        'coverage' => [makeCoverage([
            'id' => 'cov-n-1', 'feeHead' => 'Tuition', 'benefitKind' => 'Percentage', 'value' => 50.0,
        ])],
    ]);

    /** VC's List as seeded: all of tuition, and hostel as a full waiver. */
    $this->vc = makeScholarship([
        'id' => 'sch-vc',
        'coverage' => [
            makeCoverage([
                'id' => 'cov-vc-1', 'feeHead' => 'Tuition', 'benefitKind' => 'Percentage', 'value' => 100.0,
            ]),
            makeCoverage([
                'id' => 'cov-vc-2', 'feeHead' => 'Hostel', 'benefitKind' => 'Full waiver', 'value' => 100.0,
            ]),
        ],
    ]);

    /** A scholarship paying a flat sum, which no percentage can express. */
    $this->flat = makeScholarship([
        'id' => 'sch-flat',
        'coverage' => [
            makeCoverage([
                'id' => 'cov-f-1', 'feeHead' => 'Tuition', 'benefitKind' => 'Percentage', 'value' => 40.0,
            ]),
            makeCoverage([
                'id' => 'cov-f-2', 'feeHead' => 'Other', 'benefitKind' => 'Fixed amount', 'value' => 25000.0,
            ]),
        ],
    ]);
});

/** @param CoverageLine[] $coverage */
function coverageLine(array $coverage, string $head): ?CoverageLine
{
    foreach ($coverage as $line) {
        if ($line->feeHead === $head) {
            return $line;
        }
    }

    return null;
}

describe('AWARD_RATES', function () {
    it('offers the five rates the committee minutes actually use', function () {
        expect(RatePlanService::AWARD_RATES)->toBe([25, 35, 50, 75, 100]);
    });
});

describe('standardPctOf', function () {
    it('reads a percentage line', function () {
        expect($this->rates->standardPctOf($this->need, 'Tuition'))->toBe(50.0);
    });

    it('treats a full waiver as 100%', function () {
        expect($this->rates->standardPctOf($this->vc, 'Hostel'))->toBe(100.0);
    });

    it('has no standard rate for a head the scholarship does not cover', function () {
        expect($this->rates->standardPctOf($this->need, 'Hostel'))->toBeNull();
    });

    it('has no standard rate for a fixed sum, which is not a percentage', function () {
        expect($this->rates->standardPctOf($this->flat, 'Other'))->toBeNull();
    });
});

describe('rateHeads', function () {
    it('lists covered heads first, then every other fee that can be added', function () {
        expect($this->rates->rateHeads($this->need, HEADS))
            ->toBe(['Tuition', 'Hostel', 'Mess', 'Other']);
    });

    it("keeps the scholarship's own order for the heads it covers", function () {
        expect($this->rates->rateHeads($this->vc, HEADS))
            ->toBe(['Tuition', 'Hostel', 'Mess', 'Other']);
    });

    it('leaves out a head paid as a fixed sum', function () {
        expect($this->rates->rateHeads($this->flat, HEADS))->toBe(['Tuition', 'Hostel', 'Mess']);
    });
});

describe('batchPct and studentPct', function () {
    it("falls back to the scholarship's own rate when nothing is set", function () {
        expect($this->rates->batchPct($this->need, $this->empty, 'Tuition'))->toBe(50.0);
        expect($this->rates->studentPct($this->need, $this->empty, 'Tuition', 'F23-0001'))->toBe(50.0);
    });

    it('pays nothing on a head the scholarship does not cover', function () {
        expect($this->rates->batchPct($this->need, $this->empty, 'Hostel'))
            ->toBe(RatePlanService::NOT_PAID);
    });

    it("prefers a student's own rate over the batch rate", function () {
        $plan = $this->rates->setBatchRate($this->empty, 'Tuition', 25.0);
        $plan = $this->rates->setStudentRate($plan, 'F23-0001', 'Tuition', 75.0);

        expect($this->rates->batchPct($this->need, $plan, 'Tuition'))->toBe(25.0);
        expect($this->rates->studentPct($this->need, $plan, 'Tuition', 'F23-0001'))->toBe(75.0);
        expect($this->rates->studentPct($this->need, $plan, 'Tuition', 'F23-0002'))->toBe(25.0);
    });

    it('keeps an explicit zero rather than reading it as no decision', function () {
        $plan = $this->rates->setStudentRate(
            $this->empty, 'F23-0001', 'Tuition', RatePlanService::NOT_PAID
        );

        expect($this->rates->studentPct($this->need, $plan, 'Tuition', 'F23-0001'))->toBe(0.0);
        expect($this->rates->studentPct($this->need, $plan, 'Tuition', 'F23-0002'))->toBe(50.0);
    });
});

describe('setBatchRate', function () {
    it('does not mutate the plan it was given', function () {
        $before = $this->empty;
        $after = $this->rates->setBatchRate($before, 'Tuition', 75.0);

        expect($before->batch)->toBe([]);
        expect($after->batch)->toBe(['Tuition' => 75.0]);
    });

    it("drops back to the scholarship's rate when cleared", function () {
        $plan = $this->rates->setBatchRate(
            $this->rates->setBatchRate($this->empty, 'Tuition', 75.0), 'Tuition', null
        );

        expect($plan->batch)->toBe([]);
        expect($this->rates->batchPct($this->need, $plan, 'Tuition'))->toBe(50.0);
    });

    it('leaves individual decisions alone, because they were made separately', function () {
        $plan = $this->rates->setStudentRate($this->empty, 'F23-0001', 'Tuition', 100.0);
        $plan = $this->rates->setBatchRate($plan, 'Tuition', 25.0);

        expect($this->rates->studentPct($this->need, $plan, 'Tuition', 'F23-0001'))->toBe(100.0);
    });
});

describe('setStudentRate', function () {
    it('holds several heads for one student', function () {
        $plan = $this->rates->setStudentRate($this->empty, 'F23-0001', 'Tuition', 75.0);
        $plan = $this->rates->setStudentRate($plan, 'F23-0001', 'Hostel', 100.0);

        expect($this->rates->studentRate($plan, 'F23-0001', 'Tuition'))->toBe(75.0);
        expect($this->rates->studentRate($plan, 'F23-0001', 'Hostel'))->toBe(100.0);
    });

    it('forgets the student entirely once their last head is cleared', function () {
        $plan = $this->rates->setStudentRate($this->empty, 'F23-0001', 'Tuition', 75.0);
        $plan = $this->rates->setStudentRate($plan, 'F23-0001', 'Tuition', null);

        expect($plan->perStudent)->toBe([]);
        expect($this->rates->hasOwnRates($plan, 'F23-0001'))->toBeFalse();
    });

    it('does not mutate the plan it was given', function () {
        $before = $this->rates->setStudentRate($this->empty, 'F23-0001', 'Tuition', 75.0);
        $this->rates->setStudentRate($before, 'F23-0001', 'Hostel', 50.0);

        expect($before->perStudent['F23-0001'])->toBe(['Tuition' => 75.0]);
    });
});

describe('clearStudentRates', function () {
    it('returns one student to the batch rate and leaves the rest alone', function () {
        $plan = $this->rates->setStudentRate($this->empty, 'F23-0001', 'Tuition', 75.0);
        $plan = $this->rates->setStudentRate($plan, 'F23-0002', 'Tuition', 25.0);
        $plan = $this->rates->clearStudentRates($plan, 'F23-0001');

        expect($this->rates->hasOwnRates($plan, 'F23-0001'))->toBeFalse();
        expect($this->rates->hasOwnRates($plan, 'F23-0002'))->toBeTrue();
    });

    it('clears everyone at once', function () {
        $plan = $this->rates->setStudentRate($this->empty, 'F23-0001', 'Tuition', 75.0);
        $plan = $this->rates->setStudentRate($plan, 'F23-0002', 'Tuition', 25.0);

        expect($this->rates->clearAllStudentRates($plan)->perStudent)->toBe([]);
    });
});

describe('studentsWithOwnRates', function () {
    it('counts only the students asked about, not everyone ever touched', function () {
        $plan = $this->rates->setStudentRate($this->empty, 'F23-0001', 'Tuition', 75.0);
        $plan = $this->rates->setStudentRate($plan, 'F23-0009', 'Tuition', 25.0);

        expect($this->rates->studentsWithOwnRates($plan, ['F23-0001', 'F23-0002']))
            ->toBe(['F23-0001']);
    });
});

describe('hasCustomBatchRates', function () {
    it('is false when a head is set to the rate it already had', function () {
        $plan = $this->rates->setBatchRate($this->empty, 'Tuition', 50.0);

        expect($this->rates->hasCustomBatchRates($this->need, HEADS, $plan))->toBeFalse();
    });

    it('is true once a head is moved off its standard rate', function () {
        $plan = $this->rates->setBatchRate($this->empty, 'Tuition', 75.0);

        expect($this->rates->hasCustomBatchRates($this->need, HEADS, $plan))->toBeTrue();
    });

    it('is true when a fee the scholarship never covered is switched on', function () {
        $plan = $this->rates->setBatchRate($this->empty, 'Hostel', 100.0);

        expect($this->rates->hasCustomBatchRates($this->need, HEADS, $plan))->toBeTrue();
    });
});

describe('resolveCoverage', function () {
    it("returns the scholarship's own coverage when no rate is set", function () {
        expect($this->rates->resolveCoverage($this->need, HEADS, $this->empty, 'F23-0001'))
            ->toBe($this->need->coverage);
    });

    it('applies a batch rate to everyone', function () {
        $plan = $this->rates->setBatchRate($this->empty, 'Tuition', 25.0);

        $first = coverageLine($this->rates->resolveCoverage($this->need, HEADS, $plan, 'F23-0001'), 'Tuition');
        expect($first->benefitKind)->toBe('Percentage');
        expect($first->value)->toBe(25.0);

        $second = coverageLine($this->rates->resolveCoverage($this->need, HEADS, $plan, 'F23-0002'), 'Tuition');
        expect($second->value)->toBe(25.0);
    });

    it('gives two students in the same batch different amounts', function () {
        $plan = $this->rates->setBatchRate($this->empty, 'Tuition', 50.0);
        $plan = $this->rates->setStudentRate($plan, 'F23-0001', 'Tuition', 75.0);
        $plan = $this->rates->setStudentRate($plan, 'F23-0002', 'Tuition', 25.0);

        $pct = fn (string $reg) => $this->rates->pctOfHead(
            $this->rates->resolveCoverage($this->need, HEADS, $plan, $reg), 'Tuition'
        );

        expect($pct('F23-0001'))->toBe(75.0);
        expect($pct('F23-0002'))->toBe(25.0);
        expect($pct('F23-0003'))->toBe(50.0);
    });

    it('adds a fee the scholarship does not cover', function () {
        $plan = $this->rates->setStudentRate($this->empty, 'F23-0001', 'Hostel', 100.0);
        $coverage = $this->rates->resolveCoverage($this->need, HEADS, $plan, 'F23-0001');

        expect($coverage)->toHaveCount(2);
        expect(coverageLine($coverage, 'Hostel')->benefitKind)->toBe('Percentage');
        expect(coverageLine($coverage, 'Hostel')->value)->toBe(100.0);
        // Nobody else in the batch picked up the hostel line.
        expect($this->rates->resolveCoverage($this->need, HEADS, $plan, 'F23-0002'))->toHaveCount(1);
    });

    it('drops a head set to nothing rather than awarding an empty component', function () {
        $plan = $this->rates->setStudentRate(
            $this->empty, 'F23-0001', 'Tuition', RatePlanService::NOT_PAID
        );

        expect($this->rates->resolveCoverage($this->need, HEADS, $plan, 'F23-0001'))->toBe([]);
    });

    it('leaves a full waiver as a full waiver when it is not overridden', function () {
        $coverage = $this->rates->resolveCoverage($this->vc, HEADS, $this->empty, 'F23-0001');

        expect(coverageLine($coverage, 'Hostel')->benefitKind)->toBe('Full waiver');
    });

    it('rewrites a full waiver only when a different rate is chosen', function () {
        $plan = $this->rates->setStudentRate($this->empty, 'F23-0001', 'Hostel', 50.0);
        $coverage = $this->rates->resolveCoverage($this->vc, HEADS, $plan, 'F23-0001');

        expect(coverageLine($coverage, 'Hostel')->benefitKind)->toBe('Percentage');
        expect(coverageLine($coverage, 'Hostel')->value)->toBe(50.0);
    });

    it('passes a fixed sum through untouched, since a rate cannot express it', function () {
        $plan = $this->rates->setBatchRate($this->empty, 'Other', 100.0);
        $coverage = $this->rates->resolveCoverage($this->flat, HEADS, $plan, 'F23-0001');

        expect(coverageLine($coverage, 'Other')->benefitKind)->toBe('Fixed amount');
        expect(coverageLine($coverage, 'Other')->value)->toBe(25000.0);
    });

    it('keeps covered heads ahead of added ones', function () {
        $plan = $this->rates->setBatchRate($this->empty, 'Mess', 100.0);

        $heads = array_map(
            fn (CoverageLine $c) => $c->feeHead,
            $this->rates->resolveCoverage($this->need, HEADS, $plan, 'F23-0001'),
        );

        expect($heads)->toBe(['Tuition', 'Mess']);
    });
});

describe('pctOfHead', function () {
    it('counts a full waiver as the whole fee', function () {
        expect($this->rates->pctOfHead($this->vc->coverage, 'Hostel'))->toBe(100.0);
    });

    it('is zero for a head nothing pays', function () {
        expect($this->rates->pctOfHead($this->need->coverage, 'Mess'))->toBe(0.0);
    });
});

describe('describeRatePlan', function () {
    beforeEach(function () {
        $this->describe = fn (RatePlan $p) => $this->rates->describeRatePlan(
            $this->need, HEADS, $p, ['F23-0001', 'F23-0002']
        );
    });

    it('says nothing when the batch pays exactly what the scholarship says', function () {
        expect(($this->describe)($this->empty))->toBe('');
    });

    it('names a changed rate', function () {
        expect(($this->describe)($this->rates->setBatchRate($this->empty, 'Tuition', 25.0)))
            ->toBe('awarded at 25% of tuition by decision');
    });

    it('joins several changed heads', function () {
        $p = $this->rates->setBatchRate($this->empty, 'Tuition', 25.0);
        $p = $this->rates->setBatchRate($p, 'Hostel', 100.0);

        expect(($this->describe)($p))
            ->toBe('awarded at 25% of tuition and 100% of hostel by decision');
    });

    it('says when a fee was deliberately dropped', function () {
        $p = $this->rates->setBatchRate($this->empty, 'Tuition', RatePlanService::NOT_PAID);

        expect(($this->describe)($p))->toBe('awarded at no tuition by decision');
    });

    it('counts only the students in this batch who were set individually', function () {
        $p = $this->rates->setStudentRate($this->empty, 'F23-0001', 'Tuition', 75.0);
        $p = $this->rates->setStudentRate($p, 'F23-0009', 'Tuition', 25.0);

        expect(($this->describe)($p))->toBe('1 student set individually');
    });

    it('reports both a changed batch rate and the exceptions to it', function () {
        $p = $this->rates->setBatchRate($this->empty, 'Tuition', 25.0);
        $p = $this->rates->setStudentRate($p, 'F23-0001', 'Tuition', 75.0);
        $p = $this->rates->setStudentRate($p, 'F23-0002', 'Tuition', 100.0);

        expect(($this->describe)($p))
            ->toBe('awarded at 25% of tuition by decision · 2 students set individually');
    });
});
