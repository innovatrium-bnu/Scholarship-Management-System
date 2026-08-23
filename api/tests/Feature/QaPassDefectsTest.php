<?php

declare(strict_types=1);

use App\Auth\RoleMatrix;
use App\Domain\Support\RevocationCause;
use App\Models\ApplicationDecision;
use App\Models\Award;
use App\Models\Revocation;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

uses(RefreshDatabase::class);

/**
 * The defects the 339-case manual pass found, stated as tests.
 *
 * Every one of them was reachable through a supported endpoint by somebody
 * doing something ordinary, and the suite was fully green while all of them
 * were live — which is the reason each is written down here rather than
 * trusted to a comment.
 *
 * Grouped because most of them are one mistake wearing different clothes: a
 * correct pattern exists in this codebase and was applied at one site and not
 * its sibling. `isUniqueViolation` in one controller of eight; the event log
 * for one dashboard tile of two; read-then-disable on one settings screen of
 * two. Reading them together is what makes that visible to whoever writes the
 * next endpoint.
 */
beforeEach(function () {
    seedReferences();
    $this->withHeader('Origin', config('app.url'));
    actingAsRole(RoleMatrix::ADMIN);
});

/* -- APW-016 / APD-008: reopening left the award paying -------------------- */

it('ends the award when the approval that created it is reopened', function () {
    $scholarship = aScholarshipRecord();
    aStudent('F24-BSCS-001');
    criteriaFor($scholarship->id);
    $application = anApplication($scholarship->id, 'F24-BSCS-001');

    $this->postJson("/api/applications/{$application->id}/decision", [
        'outcome' => 'Approved',
        'reason' => 'Meets every criterion',
        'awardedPct' => 50,
    ])->assertCreated();

    $award = Award::firstOrFail();
    expect($award->status)->toBe('Active');

    $this->postJson("/api/applications/{$application->id}/reopen", [
        'reason' => 'Income evidence was misread',
    ])->assertOk();

    // The award used to stay Active and keep paying, with the decision row that
    // linked it to the application deleted underneath it.
    expect(Award::find($award->id)->status)->toBe('Revoked')
        ->and(Revocation::where('award_id', $award->id)->value('cause'))
        ->toBe(RevocationCause::APPLICATION_REOPENED);
});

it('says on the record that the award ended because an approval was undone', function () {
    // Before, whoever eventually noticed the orphan had to revoke it by hand,
    // and the trail then said "Revoked by hand" -- never that an approval had
    // been reversed. The cause is the whole point of the fix.
    $scholarship = aScholarshipRecord();
    aStudent('F24-BSCS-001');
    criteriaFor($scholarship->id);
    $application = anApplication($scholarship->id, 'F24-BSCS-001');

    $this->postJson("/api/applications/{$application->id}/decision", [
        'outcome' => 'Approved', 'reason' => 'Approved', 'awardedPct' => 50,
    ])->assertCreated();

    $this->postJson("/api/applications/{$application->id}/reopen", ['reason' => 'Reopened'])
        ->assertOk();

    $causes = DB::table('domain_events')->where('kind', 'award.revoked')->pluck('payload')
        ->map(fn ($payload) => json_decode($payload, true)['cause'] ?? null)
        ->all();

    expect($causes)->toContain(RevocationCause::APPLICATION_REOPENED);
});

it('lets the application be approved again once reopened, with a fresh award', function () {
    // The orphan used to block this: the student still held an active award, so
    // re-approving hit the duplicate guard and the queue entry could not move.
    $scholarship = aScholarshipRecord();
    aStudent('F24-BSCS-001');
    criteriaFor($scholarship->id);
    $application = anApplication($scholarship->id, 'F24-BSCS-001');

    $this->postJson("/api/applications/{$application->id}/decision", [
        'outcome' => 'Approved', 'reason' => 'First pass', 'awardedPct' => 50,
    ])->assertCreated();

    $this->postJson("/api/applications/{$application->id}/reopen", ['reason' => 'Reopened'])
        ->assertOk();

    $this->postJson("/api/applications/{$application->id}/decision", [
        'outcome' => 'Approved', 'reason' => 'Second pass', 'awardedPct' => 40,
    ])->assertCreated();

    expect(Award::where('status', 'Active')->count())->toBe(1)
        ->and(Award::count())->toBe(2);
});

/* -- A human bulk rejection is not a machine decision ---------------------- */

it('records a bulk rejection as the person who pressed the button', function () {
    $scholarship = aScholarshipRecord();
    aStudent('F24-BSCS-001');
    criteriaFor($scholarship->id);
    $application = anApplication($scholarship->id, 'F24-BSCS-001');

    $this->postJson('/api/applications/reject', [
        'summary' => 'Cleared the failing pile',
        'entries' => [['id' => $application->id, 'reason' => 'CGPA below the floor']],
    ])->assertOk();

    $decision = ApplicationDecision::firstOrFail();

    // `automatic` is the column a report groups by to separate what the filter
    // sorted from what a person ruled on. Storing true here made every
    // committee rejection count as a machine decision -- and AGENTS.md is
    // explicit that an automatic rejection nobody pressed a button for is one
    // nobody can defend on appeal.
    expect($decision->automatic)->toBeFalse()
        ->and($decision->decided_by)->toBe(RoleMatrix::ADMIN);
});

it('does not let a client label its own decision as the filter\'s', function () {
    $scholarship = aScholarshipRecord();
    aStudent('F24-BSCS-001');
    criteriaFor($scholarship->id);
    $application = anApplication($scholarship->id, 'F24-BSCS-001');

    $this->postJson("/api/applications/{$application->id}/decision", [
        'outcome' => 'Rejected',
        'reason' => 'Turned down',
        'automatic' => true,
    ])->assertCreated();

    expect(ApplicationDecision::firstOrFail()->automatic)->toBeFalse();
});

/* -- SEC-016: the login endpoint had no rate limit ------------------------- */

it('stops guessing at a password after five tries', function () {
    Cache::flush();
    aUser(RoleMatrix::ADMIN, ['email' => 'target@bnu.edu.pk']);

    $attempt = fn () => $this->postJson('/api/auth/login', [
        'email' => 'target@bnu.edu.pk',
        'password' => 'wrong-on-purpose',
    ]);

    for ($i = 0; $i < 5; $i++) {
        $attempt()->assertStatus(422);
    }

    // Twenty-five in a row all answered 422 and never 429.
    $attempt()->assertStatus(429);
});

it('still lets the right password through before the limit', function () {
    Cache::flush();
    aUser(RoleMatrix::ADMIN, ['email' => 'target@bnu.edu.pk']);

    $this->postJson('/api/auth/login', [
        'email' => 'target@bnu.edu.pk',
        'password' => 'wrong-on-purpose',
    ])->assertStatus(422);

    $this->postJson('/api/auth/login', [
        'email' => 'target@bnu.edu.pk',
        'password' => 'correct-horse-battery-staple',
    ])->assertOk();
});

it('counts only failures, so signing in correctly never uses up the allowance', function () {
    // The reason this lives in the controller instead of `throttle:` middleware.
    // Middleware counts every request, and BNU NATs its campus behind one
    // address -- a floor of staff signing in correctly at nine o'clock would
    // exhaust a shared allowance and lock each other out.
    Cache::flush();
    aUser(RoleMatrix::ADMIN, ['email' => 'target@bnu.edu.pk']);

    $wrong = fn () => $this->postJson('/api/auth/login', [
        'email' => 'target@bnu.edu.pk', 'password' => 'wrong-on-purpose',
    ]);
    $right = fn () => $this->postJson('/api/auth/login', [
        'email' => 'target@bnu.edu.pk', 'password' => 'correct-horse-battery-staple',
    ]);

    for ($i = 0; $i < 4; $i++) {
        $wrong()->assertStatus(422);
    }

    $right()->assertOk();

    // The successful sign-in cleared the count, so four more are still fine.
    for ($i = 0; $i < 4; $i++) {
        $wrong()->assertStatus(422);
    }
});

it('locks one account without locking everybody on the same address', function () {
    Cache::flush();
    aUser(RoleMatrix::ADMIN, ['email' => 'target@bnu.edu.pk']);
    aUser(RoleMatrix::REPORTING, ['email' => 'colleague@bnu.edu.pk']);

    for ($i = 0; $i < 6; $i++) {
        $this->postJson('/api/auth/login', [
            'email' => 'target@bnu.edu.pk', 'password' => 'wrong-on-purpose',
        ]);
    }

    $this->postJson('/api/auth/login', [
        'email' => 'target@bnu.edu.pk', 'password' => 'wrong-on-purpose',
    ])->assertStatus(429);

    // Same IP, different person, still able to work.
    $this->postJson('/api/auth/login', [
        'email' => 'colleague@bnu.edu.pk', 'password' => 'correct-horse-battery-staple',
    ])->assertOk();
});

/* -- SCC-006 / SET-004: a duplicate reached Oracle as a raw 500 ------------ */

it('refuses two coverage lines on the same fee head with a field error', function () {
    $line = fn (string $head) => [
        'feeHead' => $head, 'benefitKind' => 'Percentage', 'value' => 25,
    ];

    $this->postJson('/api/scholarships', [
        'name' => 'Duplicate coverage',
        'description' => 'Test',
        'studyLevel' => 'Bachelors',
        'batchMode' => 'all',
        'semesterFrom' => 'Spring 2026',
        'reviewCycle' => 'Annual',
        'maxDurationYears' => 1,
        'fundingSource' => 'Internal',
        'effectiveFrom' => '2026-01-01',
        'coverage' => [$line('Tuition'), $line('Tuition')],
    ])
        ->assertStatus(422)
        ->assertJsonValidationErrors('coverage.0.feeHead');
});

it('refuses two CGPA thresholds for the same intake with a field error', function () {
    $scholarship = aScholarshipRecord();

    $this->putJson("/api/scholarships/{$scholarship->id}/criteria", [
        'maxMonthlyIncome' => 100000,
        'minCreditHours' => 12,
        'minAttendancePct' => 75,
        'requiredDocuments' => [],
        'maxExistingCoveragePct' => 50,
        'autoRejectOn' => [],
        'cgpaThresholds' => [
            ['fromBatch' => 'Fall 2024', 'minCgpa' => 2.5],
            ['fromBatch' => 'Fall 2024', 'minCgpa' => 2.8],
        ],
    ])
        ->assertStatus(422)
        ->assertJsonValidationErrors('cgpaThresholds.0.fromBatch');
});

it('answers a uniqueness collision with 409 rather than 500, wherever it escapes', function () {
    // The backstop in bootstrap/app.php, for the races the pre-flight checks
    // cannot see and for endpoints nobody has written yet. ORA-00001 used to
    // surface as a 500 carrying the failing SQL, its bind values and the
    // database host, port and name.
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

    expect(fn () => Award::create($row))
        ->toThrow(QueryException::class);
});

/* -- A no-op PATCH wrote a change nobody made ------------------------------ */

it('writes no audit entry for a PATCH that changes nothing', function () {
    $scholarship = aScholarshipRecord();
    $before = DB::table('audit_entries')->count();

    // Every field on ScholarshipRequest is `sometimes`, so an empty body
    // validated, updated nothing, and still recorded "Updated scholarship X".
    $this->patchJson("/api/scholarships/{$scholarship->id}", [])->assertOk();

    expect(DB::table('audit_entries')->count())->toBe($before);
});

it('still writes one when a field actually changes', function () {
    $scholarship = aScholarshipRecord();
    $before = DB::table('audit_entries')->count();

    $this->patchJson("/api/scholarships/{$scholarship->id}", [
        'name' => 'Renamed Scholarship',
        'reason' => 'Committee renamed it',
    ])->assertOk();

    expect(DB::table('audit_entries')->count())->toBe($before + 1);
});
