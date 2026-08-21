<?php

declare(strict_types=1);

use App\Auth\RoleMatrix;
use App\Models\Award;
use App\Models\Scholarship;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

/**
 * What may not be granted, stated as tests.
 *
 * Three defects, one shape: the assign screen already refused all three, and
 * nothing else did — so the rules held exactly as long as the client was the
 * only thing asking. Each was reachable with one authorised request, and each
 * one moves money.
 *
 *   QA-03  the same scholarship granted twice to one student. The merge treats
 *          the two rows as competing claims and pays both, so a 50%
 *          scholarship pays 90% and the student page lists the same name twice.
 *   QA-04  a student the evaluation had just called NotEligible, granted in the
 *          mode named "Evaluate", which stored the word and evaluated nothing.
 *   QA-05  an archived scholarship, which is the one thing archiving exists to
 *          prevent.
 *
 * Direct mode is still allowed to override eligibility, and that is asserted
 * here too — a guard that also blocked the committee's deliberate override
 * would be a different defect rather than a fix.
 */
beforeEach(function () {
    seedReferences();
    $this->withHeader('Origin', config('app.url'));
    actingAsRole(RoleMatrix::ADMIN);
});

/**
 * A batch payload for one student, resolved the way the assign screen sends it.
 *
 * @return array<string, mixed>
 */
function pick(string $regNo, string $mode = 'Direct', float $pct = 50): array
{
    return [
        'mode' => $mode,
        'reason' => 'Test assignment',
        'picks' => [[
            'studentRegNo' => $regNo,
            'components' => [[
                'feeHead' => 'Tuition',
                'entitlementKind' => 'Percentage',
                'entitlementValue' => $pct,
                'entitlement' => $pct,
                'applied' => $pct,
            ]],
        ]],
    ];
}

/* -- QA-03: one active award per student per scholarship ------------------ */

it('refuses a second active award for a scholarship the student already holds', function () {
    $scholarship = aScholarshipRecord();
    aStudent('F24-BSCS-001');

    $this->postJson("/api/scholarships/{$scholarship->id}/assignments", pick('F24-BSCS-001'))
        ->assertCreated();

    // The exact second request that used to return 201 and double the money.
    $this->postJson("/api/scholarships/{$scholarship->id}/assignments", pick('F24-BSCS-001'))
        ->assertStatus(422)
        ->assertJsonValidationErrors('picks.0.studentRegNo');

    expect(Award::where('student_reg_no', 'F24-BSCS-001')->count())->toBe(1);
});

it('allows the same scholarship again once the first award has been revoked', function () {
    // Why the constraint is on active rows rather than on the pair: a student
    // may lose a scholarship and be granted it again, and both rows have to
    // survive as history.
    $scholarship = aScholarshipRecord();
    aStudent('F24-BSCS-001');

    $this->postJson("/api/scholarships/{$scholarship->id}/assignments", pick('F24-BSCS-001'))
        ->assertCreated();

    $award = Award::where('student_reg_no', 'F24-BSCS-001')->firstOrFail();

    $this->postJson("/api/awards/{$award->id}/revoke", [
        'effective' => '2026-02-01',
        'timing' => 'immediate',
        'cause' => 'Revoked by hand',
        'reason' => 'Test revocation',
    ])->assertCreated();

    $this->postJson("/api/scholarships/{$scholarship->id}/assignments", pick('F24-BSCS-001'))
        ->assertCreated();

    expect(Award::where('student_reg_no', 'F24-BSCS-001')->count())->toBe(2)
        ->and(Award::where('student_reg_no', 'F24-BSCS-001')->where('status', 'Active')->count())
        ->toBe(1);
});

it('refuses to approve an application for a scholarship the student already holds', function () {
    // The same defect through the review queue, which is where it actually
    // happened: a renewal approved while the previous award was still live.
    $scholarship = aScholarshipRecord();
    aStudent('F24-BSCS-001');
    criteriaFor($scholarship->id);

    $this->postJson("/api/scholarships/{$scholarship->id}/assignments", pick('F24-BSCS-001'))
        ->assertCreated();

    $application = anApplication($scholarship->id, 'F24-BSCS-001');

    $this->postJson("/api/applications/{$application->id}/decision", [
        'outcome' => 'Approved',
        'reason' => 'Renewal',
        'awardedPct' => 40,
    ])->assertStatus(409);

    expect(Award::where('student_reg_no', 'F24-BSCS-001')->where('status', 'Active')->count())
        ->toBe(1);
});

it('holds the rule at the database as well, so a race cannot slip past it', function () {
    // The application-level check reads rows, and a second writer can commit
    // between that read and the write. This is the backstop that makes the rule
    // true rather than merely likely.
    $scholarship = aScholarshipRecord();
    aStudent('F24-BSCS-001');

    $row = [
        'student_reg_no' => 'F24-BSCS-001',
        'scholarship_id' => $scholarship->id,
        'status' => 'Active',
        'effective_from' => '2026-01-01',
        'authorised_by' => 'Registrar Office',
        'reason_code' => 'First',
    ];

    Award::create($row);

    expect(fn () => Award::create(array_merge($row, ['reason_code' => 'Second'])))
        ->toThrow(QueryException::class);
});

it('refuses a batch that names the same student twice', function () {
    // The held-awards check cannot see this one: neither award exists yet when
    // it runs. Without a second check the unique index refuses the second
    // insert and the caller gets ORA-00001 as a 500 instead of a field error.
    $scholarship = aScholarshipRecord();
    aStudent('F24-BSCS-001');

    $batch = pick('F24-BSCS-001');
    $batch['picks'][] = $batch['picks'][0];

    $this->postJson("/api/scholarships/{$scholarship->id}/assignments", $batch)
        ->assertStatus(422)
        ->assertJsonValidationErrors('picks.1.studentRegNo');

    expect(Award::count())->toBe(0);
});

it('still grants a batch naming several different students', function () {
    $scholarship = aScholarshipRecord();
    aStudent('F24-BSCS-001');
    aStudent('F24-BSCS-002');

    $batch = pick('F24-BSCS-001');
    $second = pick('F24-BSCS-002');
    $batch['picks'][] = $second['picks'][0];

    $this->postJson("/api/scholarships/{$scholarship->id}/assignments", $batch)
        ->assertCreated();

    expect(Award::count())->toBe(2);
});

/* -- QA-04: Evaluate mode evaluates --------------------------------------- */

it('refuses a student the evaluation rejects when the mode says to evaluate', function () {
    // Masters student, Bachelors-only scholarship. The eligibility endpoint
    // already answered NotEligible for this pair while the assignment endpoint
    // accepted it.
    $scholarship = aScholarshipRecord();
    aStudent('F24-MBA-001')->update(['study_level' => 'Masters']);

    $this->postJson(
        "/api/scholarships/{$scholarship->id}/assignments",
        pick('F24-MBA-001', 'Evaluate')
    )
        ->assertStatus(422)
        ->assertJsonValidationErrors('picks.0.studentRegNo');

    expect(Award::count())->toBe(0);
});

it('still lets Direct mode override eligibility, which is what it is for', function () {
    $scholarship = aScholarshipRecord();
    aStudent('F24-MBA-001')->update(['study_level' => 'Masters']);

    $this->postJson(
        "/api/scholarships/{$scholarship->id}/assignments",
        pick('F24-MBA-001', 'Direct')
    )->assertCreated();

    expect(Award::count())->toBe(1);
});

/* -- QA-05: an archived scholarship is not given out ---------------------- */

it('refuses to grant an archived scholarship', function () {
    $scholarship = aScholarshipRecord(1, ['status' => 'Archived']);
    aStudent('F24-BSCS-001');

    $this->postJson("/api/scholarships/{$scholarship->id}/assignments", pick('F24-BSCS-001'))
        ->assertStatus(422)
        ->assertJsonValidationErrors('scholarship');

    expect(Award::count())->toBe(0);
});

it('grants it again once it has been restored', function () {
    $scholarship = aScholarshipRecord(1, ['status' => 'Archived']);
    aStudent('F24-BSCS-001');

    $this->postJson("/api/scholarships/{$scholarship->id}/restore", ['reason' => 'Funding resumed'])
        ->assertOk();

    $this->postJson("/api/scholarships/{$scholarship->id}/assignments", pick('F24-BSCS-001'))
        ->assertCreated();

    expect(Scholarship::find($scholarship->id)->status)->toBe('Active')
        ->and(Award::count())->toBe(1);
});
