<?php

declare(strict_types=1);

/**
 * A mirror of src/lib/scholarship/merge.test.ts, case for case.
 *
 * The TypeScript suite is the specification for this port: the browser still
 * runs the TypeScript merge to draw coverage bars, so any behaviour these two
 * do not share is a bug that shows up as a registrar seeing one number on
 * screen and another on the invoice. Each test here keeps the name of the one
 * it mirrors, so a failure points straight at its counterpart.
 */

use App\Domain\Data\MergedAward;
use App\Domain\MergeService;

beforeEach(function () {
    $this->merge = new MergeService;
});

/**
 * Pull one scholarship's merged line for a fee head, so assertions stay
 * legible. The `line()` helper at the top of merge.test.ts.
 *
 * @param  MergedAward[]  $merged
 */
function line(array $merged, string $scholarshipId, string $feeHead = 'Tuition')
{
    foreach ($merged as $m) {
        if ($m->scholarship->id !== $scholarshipId) {
            continue;
        }
        foreach ($m->components as $component) {
            if ($component->feeHead === $feeHead) {
                return $component;
            }
        }
    }

    return null;
}

describe('feeOf', function () {
    beforeEach(function () {
        $this->student = makeStudent([
            'tuitionFee' => 400000.0,
            'hostelFee' => 80000.0,
            'messFee' => 40000.0,
            'otherFee' => 20000.0,
        ]);
    });

    it('maps each core fee head to its field', function () {
        expect($this->merge->feeOf($this->student, 'Tuition'))->toBe(400000.0);
        expect($this->merge->feeOf($this->student, 'Hostel'))->toBe(80000.0);
        expect($this->merge->feeOf($this->student, 'Mess'))->toBe(40000.0);
        expect($this->merge->feeOf($this->student, 'Other'))->toBe(20000.0);
    });

    it('falls back to otherFee for a custom fee head', function () {
        expect($this->merge->feeOf($this->student, 'Transport'))->toBe(20000.0);
    });
});

describe('computeMerge', function () {
    beforeEach(function () {
        $this->student = makeStudent();
    });

    it('grants a single award its full entitlement', function () {
        $sch = makeScholarship(['id' => 'sch-a']);
        $award = makeAward([
            'id' => 'aw-1',
            'scholarshipId' => 'sch-a',
            'components' => [makeComponent('Tuition', 'Percentage', 50)],
        ]);

        $merged = $this->merge->computeMerge($this->student, [$award], [$sch]);

        $l = line($merged, 'sch-a');
        expect($l->appliedPct)->toBe(50.0);
        expect($l->entitlementPct)->toBe(50.0);
        expect($l->mergeStatus)->toBe('Full');
    });

    it('grants both awards in full when they fit under 100%', function () {
        $a = makeScholarship(['id' => 'sch-a']);
        $b = makeScholarship(['id' => 'sch-b']);
        $awards = [
            makeAward([
                'id' => 'aw-1',
                'scholarshipId' => 'sch-a',
                'components' => [makeComponent('Tuition', 'Percentage', 60)],
            ]),
            makeAward([
                'id' => 'aw-2',
                'scholarshipId' => 'sch-b',
                'components' => [makeComponent('Tuition', 'Percentage', 40)],
            ]),
        ];

        $merged = $this->merge->computeMerge($this->student, $awards, [$a, $b]);

        expect(line($merged, 'sch-a')->mergeStatus)->toBe('Full');
        expect(line($merged, 'sch-b')->mergeStatus)->toBe('Full');
        expect(line($merged, 'sch-b')->appliedPct)->toBe(40.0);
    });

    it('trims the lower-precedence award when the total exceeds 100%', function () {
        $a = makeScholarship(['id' => 'sch-a']);
        $b = makeScholarship(['id' => 'sch-b']);
        $awards = [
            makeAward([
                'id' => 'aw-1',
                'scholarshipId' => 'sch-a',
                'components' => [makeComponent('Tuition', 'Percentage', 60)],
            ]),
            makeAward([
                'id' => 'aw-2',
                'scholarshipId' => 'sch-b',
                'components' => [makeComponent('Tuition', 'Percentage', 60)],
            ]),
        ];

        $merged = $this->merge->computeMerge($this->student, $awards, [$a, $b]);

        expect(line($merged, 'sch-a')->appliedPct)->toBe(60.0);
        expect(line($merged, 'sch-a')->mergeStatus)->toBe('Full');
        expect(line($merged, 'sch-b')->appliedPct)->toBe(40.0);
        expect(line($merged, 'sch-b')->entitlementPct)->toBe(60.0);
        expect(line($merged, 'sch-b')->mergeStatus)->toBe('Trimmed');
    });

    it('uses array order in scholarships as precedence, not award order', function () {
        $a = makeScholarship(['id' => 'sch-a']);
        $b = makeScholarship(['id' => 'sch-b']);
        $awards = [
            makeAward([
                'id' => 'aw-1',
                'scholarshipId' => 'sch-a',
                'components' => [makeComponent('Tuition', 'Percentage', 60)],
            ]),
            makeAward([
                'id' => 'aw-2',
                'scholarshipId' => 'sch-b',
                'components' => [makeComponent('Tuition', 'Percentage', 60)],
            ]),
        ];

        // Same awards, reversed precedence list — the trim must move to sch-a.
        $merged = $this->merge->computeMerge($this->student, $awards, [$b, $a]);

        expect(line($merged, 'sch-b')->appliedPct)->toBe(60.0);
        expect(line($merged, 'sch-b')->mergeStatus)->toBe('Full');
        expect(line($merged, 'sch-a')->appliedPct)->toBe(40.0);
        expect(line($merged, 'sch-a')->mergeStatus)->toBe('Trimmed');
    });

    it('suppresses an award once headroom is exhausted', function () {
        $a = makeScholarship(['id' => 'sch-a']);
        $b = makeScholarship(['id' => 'sch-b']);
        $c = makeScholarship(['id' => 'sch-c']);
        $awards = [
            makeAward([
                'id' => 'aw-1',
                'scholarshipId' => 'sch-a',
                'components' => [makeComponent('Tuition', 'Percentage', 60)],
            ]),
            makeAward([
                'id' => 'aw-2',
                'scholarshipId' => 'sch-b',
                'components' => [makeComponent('Tuition', 'Percentage', 50)],
            ]),
            makeAward([
                'id' => 'aw-3',
                'scholarshipId' => 'sch-c',
                'components' => [makeComponent('Tuition', 'Percentage', 30)],
            ]),
        ];

        $merged = $this->merge->computeMerge($this->student, $awards, [$a, $b, $c]);

        expect(line($merged, 'sch-a')->appliedPct)->toBe(60.0);
        expect(line($merged, 'sch-a')->mergeStatus)->toBe('Full');
        expect(line($merged, 'sch-b')->appliedPct)->toBe(40.0);
        expect(line($merged, 'sch-b')->mergeStatus)->toBe('Trimmed');
        expect(line($merged, 'sch-c')->appliedPct)->toBe(0.0);
        expect(line($merged, 'sch-c')->mergeStatus)->toBe('Suppressed');
    });

    it('treats a full waiver as 100% and suppresses everything behind it', function () {
        $a = makeScholarship(['id' => 'sch-a']);
        $b = makeScholarship(['id' => 'sch-b']);
        $awards = [
            makeAward([
                'id' => 'aw-1',
                'scholarshipId' => 'sch-a',
                'components' => [makeComponent('Tuition', 'Full waiver', 0)],
            ]),
            makeAward([
                'id' => 'aw-2',
                'scholarshipId' => 'sch-b',
                'components' => [makeComponent('Tuition', 'Percentage', 25)],
            ]),
        ];

        $merged = $this->merge->computeMerge($this->student, $awards, [$a, $b]);

        expect(line($merged, 'sch-a')->appliedPct)->toBe(100.0);
        expect(line($merged, 'sch-a')->mergeStatus)->toBe('Full');
        expect(line($merged, 'sch-b')->appliedPct)->toBe(0.0);
        expect(line($merged, 'sch-b')->mergeStatus)->toBe('Suppressed');
    });

    it('grants fixed amounts in full without consuming percentage headroom', function () {
        $a = makeScholarship(['id' => 'sch-a']);
        $b = makeScholarship(['id' => 'sch-b']);
        $awards = [
            makeAward([
                'id' => 'aw-1',
                'scholarshipId' => 'sch-a',
                'components' => [makeComponent('Tuition', 'Percentage', 100)],
            ]),
            makeAward([
                'id' => 'aw-2',
                'scholarshipId' => 'sch-b',
                'components' => [makeComponent('Tuition', 'Fixed amount', 50000)],
            ]),
        ];

        $merged = $this->merge->computeMerge($this->student, $awards, [$a, $b]);

        expect(line($merged, 'sch-a')->appliedPct)->toBe(100.0);
        expect(line($merged, 'sch-a')->mergeStatus)->toBe('Full');
        expect(line($merged, 'sch-b')->appliedPKR)->toBe(50000.0);
        expect(line($merged, 'sch-b')->appliedPct)->toBe(0.0);
        expect(line($merged, 'sch-b')->mergeStatus)->toBe('Full');
    });

    it('honours a pinned override first and trims others against what is left', function () {
        $a = makeScholarship(['id' => 'sch-a']);
        $b = makeScholarship(['id' => 'sch-b']);
        $awards = [
            makeAward([
                'id' => 'aw-1',
                'scholarshipId' => 'sch-a',
                'components' => [makeComponent('Tuition', 'Percentage', 70, [
                    'isOverridden' => true,
                    'overrideReason' => 'Committee decision',
                    'overrideAuthority' => 'Registrar',
                ])],
            ]),
            makeAward([
                'id' => 'aw-2',
                'scholarshipId' => 'sch-b',
                'components' => [makeComponent('Tuition', 'Percentage', 50)],
            ]),
        ];

        $merged = $this->merge->computeMerge($this->student, $awards, [$a, $b]);

        expect(line($merged, 'sch-a')->appliedPct)->toBe(70.0);
        expect(line($merged, 'sch-a')->mergeStatus)->toBe('Full');
        expect(line($merged, 'sch-a')->isOverridden)->toBeTrue();
        expect(line($merged, 'sch-a')->overrideReason)->toBe('Committee decision');
        // 100 - 70 pinned = 30 left for the rest.
        expect(line($merged, 'sch-b')->appliedPct)->toBe(30.0);
        expect(line($merged, 'sch-b')->mergeStatus)->toBe('Trimmed');
    });

    it('floors headroom at zero when pinned overrides already exceed 100%', function () {
        $a = makeScholarship(['id' => 'sch-a']);
        $b = makeScholarship(['id' => 'sch-b']);
        $c = makeScholarship(['id' => 'sch-c']);
        $awards = [
            makeAward([
                'id' => 'aw-1',
                'scholarshipId' => 'sch-a',
                'components' => [makeComponent('Tuition', 'Percentage', 80, ['isOverridden' => true])],
            ]),
            makeAward([
                'id' => 'aw-2',
                'scholarshipId' => 'sch-b',
                'components' => [makeComponent('Tuition', 'Percentage', 40, ['isOverridden' => true])],
            ]),
            makeAward([
                'id' => 'aw-3',
                'scholarshipId' => 'sch-c',
                'components' => [makeComponent('Tuition', 'Percentage', 20)],
            ]),
        ];

        $merged = $this->merge->computeMerge($this->student, $awards, [$a, $b, $c]);

        // Pinned lines are paid as written, even past the ceiling.
        expect(line($merged, 'sch-a')->appliedPct)->toBe(80.0);
        expect(line($merged, 'sch-b')->appliedPct)->toBe(40.0);
        // Headroom cannot go negative, so the unpinned line is suppressed, not inverted.
        expect(line($merged, 'sch-c')->appliedPct)->toBe(0.0);
        expect(line($merged, 'sch-c')->mergeStatus)->toBe('Suppressed');
    });

    it('merges each fee head independently', function () {
        $a = makeScholarship(['id' => 'sch-a']);
        $b = makeScholarship(['id' => 'sch-b']);
        $awards = [
            makeAward([
                'id' => 'aw-1',
                'scholarshipId' => 'sch-a',
                'components' => [makeComponent('Tuition', 'Percentage', 100)],
            ]),
            makeAward([
                'id' => 'aw-2',
                'scholarshipId' => 'sch-b',
                'components' => [
                    makeComponent('Tuition', 'Percentage', 50),
                    makeComponent('Hostel', 'Percentage', 50),
                ],
            ]),
        ];

        $merged = $this->merge->computeMerge($this->student, $awards, [$a, $b]);

        // Tuition is exhausted by sch-a, but hostel is untouched.
        expect(line($merged, 'sch-b', 'Tuition')->mergeStatus)->toBe('Suppressed');
        expect(line($merged, 'sch-b', 'Hostel')->appliedPct)->toBe(50.0);
        expect(line($merged, 'sch-b', 'Hostel')->mergeStatus)->toBe('Full');
    });

    it('pays a mayExceedCeiling award in full once the ceiling is already claimed', function () {
        $internal = makeScholarship(['id' => 'sch-internal']);
        $donor = makeScholarship(['id' => 'sch-donor', 'mayExceedCeiling' => true]);
        $awards = [
            makeAward([
                'id' => 'aw-1',
                'scholarshipId' => 'sch-internal',
                'components' => [makeComponent('Tuition', 'Percentage', 100)],
            ]),
            makeAward([
                'id' => 'aw-2',
                'scholarshipId' => 'sch-donor',
                'components' => [makeComponent('Tuition', 'Percentage', 40)],
            ]),
        ];

        $merged = $this->merge->computeMerge($this->student, $awards, [$internal, $donor]);

        expect(line($merged, 'sch-internal')->appliedPct)->toBe(100.0);
        expect(line($merged, 'sch-internal')->mergeStatus)->toBe('Full');
        expect(line($merged, 'sch-donor')->appliedPct)->toBe(40.0);
        expect(line($merged, 'sch-donor')->entitlementPct)->toBe(40.0);
        expect(line($merged, 'sch-donor')->mergeStatus)->toBe('Full');
    });

    it("does not let a mayExceedCeiling award consume another award's headroom", function () {
        $donor = makeScholarship(['id' => 'sch-donor', 'mayExceedCeiling' => true]);
        $internal = makeScholarship(['id' => 'sch-internal']);
        $awards = [
            makeAward([
                'id' => 'aw-1',
                'scholarshipId' => 'sch-donor',
                'components' => [makeComponent('Tuition', 'Percentage', 40)],
            ]),
            makeAward([
                'id' => 'aw-2',
                'scholarshipId' => 'sch-internal',
                'components' => [makeComponent('Tuition', 'Percentage', 100)],
            ]),
        ];

        $merged = $this->merge->computeMerge($this->student, $awards, [$donor, $internal]);

        expect(line($merged, 'sch-donor')->appliedPct)->toBe(40.0);
        expect(line($merged, 'sch-donor')->mergeStatus)->toBe('Full');
        expect(line($merged, 'sch-internal')->appliedPct)->toBe(100.0);
        expect(line($merged, 'sch-internal')->mergeStatus)->toBe('Full');
    });

    it('keeps a pinned mayExceedCeiling override out of the headroom subtraction', function () {
        $donor = makeScholarship(['id' => 'sch-donor', 'mayExceedCeiling' => true]);
        $internal = makeScholarship(['id' => 'sch-internal']);
        $pinned = makeComponent('Tuition', 'Percentage', 30, ['isOverridden' => true]);
        $awards = [
            makeAward([
                'id' => 'aw-1',
                'scholarshipId' => 'sch-donor',
                'components' => [$pinned],
            ]),
            makeAward([
                'id' => 'aw-2',
                'scholarshipId' => 'sch-internal',
                'components' => [makeComponent('Tuition', 'Percentage', 100)],
            ]),
        ];

        $merged = $this->merge->computeMerge($this->student, $awards, [$donor, $internal]);

        expect(line($merged, 'sch-donor')->appliedPct)->toBe(30.0);
        expect(line($merged, 'sch-donor')->mergeStatus)->toBe('Full');
        expect(line($merged, 'sch-internal')->appliedPct)->toBe(100.0);
        expect(line($merged, 'sch-internal')->mergeStatus)->toBe('Full');
    });

    it('drops awards whose scholarship is missing rather than throwing', function () {
        $a = makeScholarship(['id' => 'sch-a']);
        $awards = [
            makeAward([
                'id' => 'aw-1',
                'scholarshipId' => 'sch-a',
                'components' => [makeComponent('Tuition', 'Percentage', 50)],
            ]),
            makeAward([
                'id' => 'aw-2',
                'scholarshipId' => 'sch-gone',
                'components' => [makeComponent('Tuition', 'Percentage', 50)],
            ]),
        ];

        $merged = $this->merge->computeMerge($this->student, $awards, [$a]);

        expect($merged)->toHaveCount(1);
        expect($merged[0]->scholarship->id)->toBe('sch-a');
    });
});

describe('ceilingBreach', function () {
    beforeEach(function () {
        $this->candidate = makeScholarship([
            'id' => 'sch-new',
            'coverage' => [makeCoverage([
                'feeHead' => 'Tuition', 'benefitKind' => 'Percentage', 'value' => 50.0,
            ])],
        ]);
    });

    it('reports no breach when the total stays at or under 100%', function () {
        $existing = [makeAward(['components' => [makeComponent('Tuition', 'Percentage', 50)]])];

        expect($this->merge->ceilingBreach($this->candidate, $existing))->toBe([]);
    });

    it('reports the head and total when the candidate pushes past 100%', function () {
        $existing = [makeAward(['components' => [makeComponent('Tuition', 'Percentage', 70)]])];

        expect($this->merge->ceilingBreach($this->candidate, $existing))
            ->toBe([['head' => 'Tuition', 'total' => 120.0]]);
    });

    it('counts an existing full waiver as 100%', function () {
        $existing = [makeAward(['components' => [makeComponent('Tuition', 'Full waiver', 0)]])];

        expect($this->merge->ceilingBreach($this->candidate, $existing))
            ->toBe([['head' => 'Tuition', 'total' => 150.0]]);
    });

    it('reports no breach when the candidate is allowed to exceed the ceiling', function () {
        $donor = makeScholarship([
            'id' => 'sch-donor',
            'mayExceedCeiling' => true,
            'coverage' => [makeCoverage([
                'feeHead' => 'Tuition', 'benefitKind' => 'Percentage', 'value' => 50.0,
            ])],
        ]);
        $existing = [makeAward(['components' => [makeComponent('Tuition', 'Percentage', 70)]])];

        expect($this->merge->ceilingBreach($donor, $existing, [$donor]))->toBe([]);
    });

    it('leaves an existing exempt award out of the total', function () {
        $donor = makeScholarship(['id' => 'sch-donor', 'mayExceedCeiling' => true]);
        $existing = [makeAward([
            'scholarshipId' => 'sch-donor',
            'components' => [makeComponent('Tuition', 'Percentage', 70)],
        ])];

        expect($this->merge->ceilingBreach($this->candidate, $existing, [$donor]))->toBe([]);
    });

    it('ignores fixed amounts, which do not contest the percentage ceiling', function () {
        $existing = [makeAward(['components' => [makeComponent('Tuition', 'Fixed amount', 900000)]])];

        expect($this->merge->ceilingBreach($this->candidate, $existing))->toBe([]);
    });
});

describe('waiverValuePKR', function () {
    beforeEach(function () {
        $this->student = makeStudent(['tuitionFee' => 400000.0, 'hostelFee' => 80000.0]);
    });

    it('values a percentage against the matching fee head', function () {
        $merged = $this->merge->computeMerge(
            $this->student,
            [makeAward([
                'scholarshipId' => 'sch-a',
                'components' => [makeComponent('Tuition', 'Percentage', 50)],
            ])],
            [makeScholarship(['id' => 'sch-a'])],
        );

        expect($this->merge->waiverValuePKR($this->student, $merged))->toBe(200000.0);
    });

    it('adds fixed amounts on top of percentage value across heads', function () {
        $merged = $this->merge->computeMerge(
            $this->student,
            [
                makeAward([
                    'id' => 'aw-1',
                    'scholarshipId' => 'sch-a',
                    'components' => [
                        makeComponent('Tuition', 'Percentage', 25),
                        makeComponent('Hostel', 'Percentage', 50),
                    ],
                ]),
                makeAward([
                    'id' => 'aw-2',
                    'scholarshipId' => 'sch-b',
                    'components' => [makeComponent('Other', 'Fixed amount', 15000)],
                ]),
            ],
            [makeScholarship(['id' => 'sch-a']), makeScholarship(['id' => 'sch-b'])],
        );

        // 25% of 400000 = 100000, 50% of 80000 = 40000, plus 15000 fixed.
        expect($this->merge->waiverValuePKR($this->student, $merged))->toBe(155000.0);
    });

    it('counts only what was actually applied after trimming', function () {
        $merged = $this->merge->computeMerge(
            $this->student,
            [
                makeAward([
                    'id' => 'aw-1',
                    'scholarshipId' => 'sch-a',
                    'components' => [makeComponent('Tuition', 'Percentage', 80)],
                ]),
                makeAward([
                    'id' => 'aw-2',
                    'scholarshipId' => 'sch-b',
                    'components' => [makeComponent('Tuition', 'Percentage', 80)],
                ]),
            ],
            [makeScholarship(['id' => 'sch-a']), makeScholarship(['id' => 'sch-b'])],
        );

        // 80% granted + 20% trimmed remainder = 100% of tuition, never more.
        expect($this->merge->waiverValuePKR($this->student, $merged))->toBe(400000.0);
    });
});
