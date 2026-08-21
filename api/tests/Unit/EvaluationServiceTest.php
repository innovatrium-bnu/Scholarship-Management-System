<?php

declare(strict_types=1);

/**
 * A mirror of src/lib/scholarship/evaluate.test.ts, case for case.
 *
 * Same contract as the merge mirror: the TypeScript suite is the
 * specification, and each test keeps the name of the one it mirrors so a
 * failure points straight at its counterpart.
 */

use App\Domain\EvaluationService;

beforeEach(function () {
    $this->evaluator = new EvaluationService;
});

describe('evaluate — already held', function () {
    it('marks a student who already holds the scholarship', function () {
        $sch = makeScholarship(['id' => 'sch-a']);
        $student = makeStudent(['regNo' => 'F23-0001']);
        $existing = [makeAward([
            'studentRegNo' => 'F23-0001', 'scholarshipId' => 'sch-a', 'status' => 'Active',
        ])];

        $results = $this->evaluator->evaluate($sch, [$student], $existing);

        expect($results[0]->status)->toBe('AlreadyHolds');
    });

    it('does not count a revoked award as held', function () {
        $sch = makeScholarship(['id' => 'sch-a']);
        $student = makeStudent(['regNo' => 'F23-0001']);
        $existing = [makeAward([
            'studentRegNo' => 'F23-0001', 'scholarshipId' => 'sch-a', 'status' => 'Revoked',
        ])];

        $results = $this->evaluator->evaluate($sch, [$student], $existing);

        expect($results[0]->status)->toBe('Eligible');
    });

    it('does not count an award for a different scholarship as held', function () {
        $sch = makeScholarship(['id' => 'sch-a']);
        $student = makeStudent(['regNo' => 'F23-0001']);
        $existing = [makeAward([
            'studentRegNo' => 'F23-0001', 'scholarshipId' => 'sch-other', 'status' => 'Active',
        ])];

        $results = $this->evaluator->evaluate($sch, [$student], $existing);

        expect($results[0]->status)->toBe('Eligible');
    });
});

describe('evaluate — scope', function () {
    it('passes a student when no scope restrictions are set', function () {
        $results = $this->evaluator->evaluate(makeScholarship(), [makeStudent()], []);

        expect($results[0]->status)->toBe('Eligible');
        expect($results[0]->reasons)->toBe([]);
    });

    it('rejects a mismatched study level', function () {
        $sch = makeScholarship(['studyLevel' => 'Masters']);

        $results = $this->evaluator->evaluate($sch, [makeStudent(['studyLevel' => 'Bachelors'])], []);

        expect($results[0]->status)->toBe('NotEligible');
        expect($results[0]->reasons[0])->toContain('Masters');
    });

    it('accepts either study level when the scholarship is Both', function () {
        $sch = makeScholarship(['studyLevel' => 'Both']);

        $bachelors = $this->evaluator->evaluate($sch, [makeStudent(['studyLevel' => 'Bachelors'])], []);
        $masters = $this->evaluator->evaluate($sch, [makeStudent(['studyLevel' => 'Masters'])], []);

        expect($bachelors[0]->status)->toBe('Eligible');
        expect($masters[0]->status)->toBe('Eligible');
    });

    it('rejects a school outside the eligible list', function () {
        $sch = makeScholarship(['schools' => ['School of Education']]);

        $results = $this->evaluator->evaluate(
            $sch, [makeStudent(['school' => 'School of Computer & IT'])], []
        );

        expect($results[0]->status)->toBe('NotEligible');
        expect($results[0]->reasons[0])->toContain('School not eligible');
    });

    it('rejects a programme outside the eligible list', function () {
        $sch = makeScholarship(['programmes' => ['BS Software Engineering']]);

        $results = $this->evaluator->evaluate(
            $sch, [makeStudent(['programme' => 'BS Computer Science'])], []
        );

        expect($results[0]->status)->toBe('NotEligible');
        expect($results[0]->reasons[0])->toContain('Programme not eligible');
    });

    it('rejects a batch outside the eligible list', function () {
        $sch = makeScholarship(['batches' => ['Fall 2025']]);

        $results = $this->evaluator->evaluate($sch, [makeStudent(['batch' => 'Fall 2023'])], []);

        expect($results[0]->status)->toBe('NotEligible');
        expect($results[0]->reasons[0])->toContain('Batch not eligible');
    });

    it('treats an empty scope list as no restriction', function () {
        $sch = makeScholarship(['schools' => [], 'programmes' => [], 'batches' => []]);

        $results = $this->evaluator->evaluate($sch, [makeStudent()], []);

        expect($results[0]->status)->toBe('Eligible');
    });
});

describe('evaluate — automatic rules', function () {
    it('passes a CGPA at the >= threshold', function () {
        $sch = makeScholarship(['awardRules' => [makeRule([
            'kind' => 'Automatic', 'field' => 'cgpa', 'operator' => '>=', 'threshold' => 3.5,
        ])]]);

        $results = $this->evaluator->evaluate($sch, [makeStudent(['cgpa' => 3.5])], []);

        expect($results[0]->status)->toBe('Eligible');
    });

    it('fails a CGPA below the >= threshold and explains why', function () {
        $sch = makeScholarship(['awardRules' => [makeRule([
            'kind' => 'Automatic', 'field' => 'cgpa', 'operator' => '>=', 'threshold' => 3.5,
        ])]]);

        $results = $this->evaluator->evaluate($sch, [makeStudent(['cgpa' => 3.49])], []);

        expect($results[0]->status)->toBe('NotEligible');
        expect($results[0]->reasons[0])->toBe('CGPA 3.49 is below the required 3.5');
    });

    it('requires a strictly greater CGPA for the > operator', function () {
        $sch = makeScholarship(['awardRules' => [makeRule([
            'kind' => 'Automatic', 'field' => 'cgpa', 'operator' => '>', 'threshold' => 3.5,
        ])]]);

        $atThreshold = $this->evaluator->evaluate($sch, [makeStudent(['cgpa' => 3.5])], []);
        $above = $this->evaluator->evaluate($sch, [makeStudent(['cgpa' => 3.51])], []);

        expect($atThreshold[0]->status)->toBe('NotEligible');
        expect($above[0]->status)->toBe('Eligible');
    });

    it('falls back to reading a threshold out of the description', function () {
        $sch = makeScholarship(['awardRules' => [makeRule([
            'kind' => 'Automatic', 'description' => 'Minimum CGPA of 3.7',
        ])]]);

        $below = $this->evaluator->evaluate($sch, [makeStudent(['cgpa' => 3.6])], []);
        $above = $this->evaluator->evaluate($sch, [makeStudent(['cgpa' => 3.8])], []);

        expect($below[0]->status)->toBe('NotEligible');
        expect($above[0]->status)->toBe('Eligible');
    });

    it('passes an automatic rule it cannot interpret rather than blocking the award', function () {
        $sch = makeScholarship(['awardRules' => [makeRule([
            'kind' => 'Automatic', 'description' => 'Approved by the dean',
        ])]]);

        $results = $this->evaluator->evaluate($sch, [makeStudent()], []);

        expect($results[0]->status)->toBe('Eligible');
    });
});

describe('evaluate — manual rules', function () {
    // The same four cases the TypeScript suite loops over.
    $cases = [
        ['Financial need assessment', 'financialNeedVerified', 'Financial need verification'],
        ['Personal statement review', 'personalStatementOk', 'Personal statement review'],
        ['Sports medal check', 'hasSportsMedal', 'Sports medal verification'],
        ['B.Fit membership', 'bfitMember', 'B.Fit membership'],
    ];

    foreach ($cases as [$description, $field, $label]) {
        it("flags \"$description\" as pending when unverified",
            function () use ($description, $field, $label) {
                $sch = makeScholarship(['awardRules' => [makeRule([
                    'kind' => 'Manual', 'description' => $description,
                ])]]);

                $results = $this->evaluator->evaluate($sch, [makeStudent([$field => false])], []);

                expect($results[0]->status)->toBe('PendingVerification');
                expect($results[0]->reasons[0])->toBe("$label required");
            });

        it("passes \"$description\" once verified", function () use ($description, $field) {
            $sch = makeScholarship(['awardRules' => [makeRule([
                'kind' => 'Manual', 'description' => $description,
            ])]]);

            $results = $this->evaluator->evaluate($sch, [makeStudent([$field => true])], []);

            expect($results[0]->status)->toBe('Eligible');
        });
    }

    it('falls back to pending with the raw description for an unrecognised manual rule', function () {
        $sch = makeScholarship(['awardRules' => [makeRule([
            'kind' => 'Manual', 'description' => 'Interview with the panel',
        ])]]);

        $results = $this->evaluator->evaluate($sch, [makeStudent()], []);

        expect($results[0]->status)->toBe('PendingVerification');
        expect($results[0]->reasons)->toBe(['Interview with the panel']);
    });

    it('lets NotEligible win over PendingVerification', function () {
        $sch = makeScholarship([
            'studyLevel' => 'Masters',
            'awardRules' => [makeRule(['kind' => 'Manual', 'description' => 'Financial need assessment'])],
        ]);

        $results = $this->evaluator->evaluate(
            $sch,
            [makeStudent(['studyLevel' => 'Bachelors', 'financialNeedVerified' => false])],
            [],
        );

        expect($results[0]->status)->toBe('NotEligible');
    });
});

describe('evaluate — cohort rank', function () {
    /** Ten students, CGPA 4.0 down to 3.1, so percentiles land on clean tens. */
    $cohort = function (): array {
        $students = [];
        for ($i = 0; $i < 10; $i++) {
            $students[] = makeStudent([
                'regNo' => 'F23-00'.str_pad((string) ($i + 1), 2, '0', STR_PAD_LEFT),
                'cgpa' => round((4.0 - $i * 0.1) * 100) / 100,
            ]);
        }

        return $students;
    };

    beforeEach(function () use ($cohort) {
        $this->cohort = $cohort;
        $this->topQuarter = makeScholarship([
            'id' => 'sch-rank',
            'awardRules' => [makeRule(['kind' => 'Cohort rank', 'percentile' => 25.0])],
        ]);
    });

    it('ranks by CGPA descending and assigns percentiles', function () {
        $results = $this->evaluator->evaluate($this->topQuarter, ($this->cohort)(), []);

        expect($results[0]->rank)->toBe(1);
        expect($results[0]->percentile)->toBe(10.0);
        expect($results[4]->rank)->toBe(5);
        expect($results[4]->percentile)->toBe(50.0);
        expect($results[9]->rank)->toBe(10);
        expect($results[9]->percentile)->toBe(100.0);
    });

    it('admits students inside the cutoff and rejects those outside', function () {
        $results = $this->evaluator->evaluate($this->topQuarter, ($this->cohort)(), []);

        expect($results[0]->status)->toBe('Eligible');
        expect($results[1]->status)->toBe('Eligible');
        expect($results[2]->status)->toBe('NotEligible');
        expect($results[2]->reasons[0])->toContain('outside top 25%');
    });

    it('ranks a single targeted student against the whole cohort, not against themselves', function () {
        $all = ($this->cohort)();
        $fifthBest = $all[4];

        // Evaluating one student must not make them automatically top of a cohort of one.
        $results = $this->evaluator->evaluate($this->topQuarter, [$fifthBest], [], $all);

        expect($results[0]->rank)->toBe(5);
        expect($results[0]->percentile)->toBe(50.0);
        expect($results[0]->status)->toBe('NotEligible');
    });

    it('excludes out-of-scope students from the ranking population', function () {
        $sch = makeScholarship([
            'id' => 'sch-rank',
            'schools' => ['School of Computer & IT'],
            'awardRules' => [makeRule(['kind' => 'Cohort rank', 'percentile' => 50.0])],
        ]);
        $all = [
            makeStudent(['regNo' => 'F23-0001', 'cgpa' => 4.0, 'school' => 'School of Education']),
            makeStudent(['regNo' => 'F23-0002', 'cgpa' => 3.5, 'school' => 'School of Computer & IT']),
            makeStudent(['regNo' => 'F23-0003', 'cgpa' => 3.2, 'school' => 'School of Computer & IT']),
        ];

        $results = $this->evaluator->evaluate($sch, $all, [], $all);

        // The 4.0 student is out of scope, so the 3.5 student tops a cohort of two.
        expect($results[0]->status)->toBe('NotEligible');
        expect($results[1]->rank)->toBe(1);
        expect($results[1]->percentile)->toBe(50.0);
        expect($results[1]->status)->toBe('Eligible');
        expect($results[2]->rank)->toBe(2);
        expect($results[2]->percentile)->toBe(100.0);
        expect($results[2]->status)->toBe('NotEligible');
    });

    it('marks a student absent from the ranking population as outside the cohort', function () {
        $all = ($this->cohort)();
        $outsider = makeStudent(['regNo' => 'F23-9999', 'cgpa' => 4.0]);

        $results = $this->evaluator->evaluate($this->topQuarter, [$outsider], [], $all);

        expect($results[0]->status)->toBe('NotEligible');
        expect($results[0]->reasons)->toContain('Outside targeted cohort');
    });
});

describe('evaluate — combined', function () {
    /**
     * Scope checks short-circuit: scopeFailure returns on the first failure, so
     * a student who fails on both study level and school is told about the
     * study level only. Rule failures then accumulate on top. This documents
     * the current behaviour — if the reason list should ever become
     * exhaustive, this is the test that should change first.
     */
    it('reports one scope reason plus every failing rule', function () {
        $sch = makeScholarship([
            'studyLevel' => 'Masters',
            'schools' => ['School of Education'],
            'awardRules' => [makeRule([
                'kind' => 'Automatic', 'field' => 'cgpa', 'operator' => '>=', 'threshold' => 3.5,
            ])],
        ]);

        $results = $this->evaluator->evaluate($sch, [makeStudent([
            'studyLevel' => 'Bachelors', 'school' => 'School of Computer & IT', 'cgpa' => 2.0,
        ])], []);

        expect($results[0]->status)->toBe('NotEligible');
        expect($results[0]->reasons)->toBe([
            'Study level (requires Masters)',
            'CGPA 2.00 is below the required 3.5',
        ]);
    });

    it('returns one result per student, in input order', function () {
        $students = [
            makeStudent(['regNo' => 'F23-0001']),
            makeStudent(['regNo' => 'F23-0002']),
            makeStudent(['regNo' => 'F23-0003']),
        ];

        $results = $this->evaluator->evaluate(makeScholarship(), $students, []);

        expect(array_map(fn ($r) => $r->student->regNo, $results))
            ->toBe(['F23-0001', 'F23-0002', 'F23-0003']);
    });

    it('ignores components on unrelated awards when checking what is held', function () {
        $sch = makeScholarship(['id' => 'sch-a']);
        $students = [makeStudent(['regNo' => 'F23-0001']), makeStudent(['regNo' => 'F23-0002'])];
        $existing = [makeAward([
            'studentRegNo' => 'F23-0002',
            'scholarshipId' => 'sch-a',
            'components' => [makeComponent('Tuition', 'Percentage', 50)],
        ])];

        $results = $this->evaluator->evaluate($sch, $students, $existing);

        expect($results[0]->status)->toBe('Eligible');
        expect($results[1]->status)->toBe('AlreadyHolds');
    });
});
