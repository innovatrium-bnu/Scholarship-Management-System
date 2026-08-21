<?php

declare(strict_types=1);

use App\Auth\RoleMatrix;
use App\Models\AssignmentBatch;
use App\Models\AuditEntry;
use App\Models\Award;
use App\Models\User;
use Database\Seeders\UserSeeder;

/**
 * Logging in, and being kept out.
 *
 * roles.ts has described this permission model since before there was a
 * backend, and said plainly that it "cannot keep anyone out". These are the
 * tests that make that sentence out of date.
 */

/*
 * Every request here carries an Origin from SANCTUM_STATEFUL_DOMAINS.
 *
 * That is what makes it a session request. Sanctum decides statefulness from
 * the Origin or Referer header, so a test without one exercises the token path
 * instead — and would pass while proving nothing about the flow the browser
 * actually uses.
 */
beforeEach(fn () => $this->withHeader('Origin', config('app.url')));

/* -- Session ------------------------------------------------------------- */

it('logs in with the right credentials and says what the role may do', function () {
    aUser(RoleMatrix::DATA_ENTRY);

    $response = $this->postJson('/api/auth/login', [
        'email' => 'dataentry@bnu.edu.pk',
        'password' => 'correct-horse-battery-staple',
    ]);

    $response->assertOk();

    expect($response->json('data.role'))->toBe(RoleMatrix::DATA_ENTRY)
        // Sent so the SPA can hide controls the API would refuse anyway. It is
        // never the check itself.
        ->and($response->json('data.capabilities'))->toBe([
            RoleMatrix::APPLICATIONS_READ,
            RoleMatrix::STUDENTS_EDIT,
        ])
        // The hash must not leave the server, cast or not.
        ->and($response->json('data'))->not->toHaveKey('password');

    $this->assertAuthenticated('web');
});

it('gives the same answer for a wrong password and an unknown address', function () {
    $user = aUser();

    $wrongPassword = $this->postJson('/api/auth/login', [
        'email' => $user->email,
        'password' => 'not-the-password',
    ]);

    $unknownEmail = $this->postJson('/api/auth/login', [
        'email' => 'nobody@bnu.edu.pk',
        'password' => 'correct-horse-battery-staple',
    ]);

    $wrongPassword->assertStatus(422);
    $unknownEmail->assertStatus(422);

    // Distinguishing them turns the login form into a way of asking which
    // addresses have accounts, which for a university is a staff list.
    expect($wrongPassword->json('errors.email'))
        ->toBe($unknownEmail->json('errors.email'));

    $this->assertGuest();
});

it('logs out and stops accepting the old session', function () {
    // Logged in through the endpoint rather than with actingAs(), which sets
    // the guard user directly and would survive a logout it never went
    // through. The point here is the session, so the session has to be real.
    $user = aUser();

    $this->postJson('/api/auth/login', [
        'email' => $user->email,
        'password' => 'correct-horse-battery-staple',
    ])->assertOk();

    $this->getJson('/api/auth/me')->assertOk();

    $this->postJson('/api/auth/logout')->assertNoContent();

    $this->getJson('/api/auth/me')->assertUnauthorized();
});

it('refuses an unauthenticated request rather than answering it', function () {
    seedReferences();

    $this->getJson('/api/reference')->assertUnauthorized();
    $this->getJson('/api/scholarships')->assertUnauthorized();
    $this->getJson('/api/students')->assertUnauthorized();
    $this->getJson('/api/audit')->assertUnauthorized();
    $this->getJson('/api/reports/summary')->assertUnauthorized();
});

it('reports the signed-in user from me', function () {
    actingAsRole(RoleMatrix::REPORTING);

    $response = $this->getJson('/api/auth/me');

    $response->assertOk();

    expect($response->json('data.role'))->toBe(RoleMatrix::REPORTING)
        ->and($response->json('data.capabilities'))->toBe([RoleMatrix::APPLICATIONS_READ]);
});

/* -- Enforcement ---------------------------------------------------------- */

/**
 * Every guarded route, tried by every role.
 *
 * The gate runs as route middleware, before the controller and before
 * validation, so an empty payload is enough: a role that may not call the
 * endpoint gets 403, and a role that may gets whatever the controller makes of
 * an empty body — usually 422. So "not 403" is the assertion for permitted, and
 * it stays honest without this test needing a valid payload for sixteen
 * different endpoints.
 *
 * Route-model binding runs before the gate, so the ids below have to be real or
 * the 404 would mask the result.
 *
 * @return list<array{0: string, 1: string, 2: string}>
 */
function guardedRoutes(): array
{
    seedReferences();
    $scholarship = aScholarshipRecord();
    criteriaFor($scholarship->id);
    aStudent('F24-BSCS-001');
    $application = anApplication($scholarship->id, 'F24-BSCS-001');

    $award = Award::create([
        'student_reg_no' => 'F24-BSCS-001',
        'scholarship_id' => $scholarship->id,
        'status' => 'Active',
        'effective_from' => '2026-01-01',
        'authorised_by' => 'Registrar Office',
        'reason_code' => 'Merit',
    ]);

    $batch = AssignmentBatch::create([
        'scholarship_id' => $scholarship->id,
        'actor' => 'Registrar Office',
        'reason' => 'Merit list',
        'assignment_mode' => 'Direct',
        'undone' => false,
    ]);

    return [
        ['post', '/api/fee-heads', RoleMatrix::SCHOLARSHIPS_EDIT],
        ['delete', '/api/fee-heads/Hostel', RoleMatrix::SCHOLARSHIPS_EDIT],
        ['post', '/api/scholarships', RoleMatrix::SCHOLARSHIPS_EDIT],
        ['put', '/api/scholarships/precedence', RoleMatrix::SCHOLARSHIPS_EDIT],
        ['patch', '/api/scholarships/'.$scholarship->id, RoleMatrix::SCHOLARSHIPS_EDIT],
        ['post', '/api/scholarships/'.$scholarship->id.'/archive', RoleMatrix::SCHOLARSHIPS_EDIT],
        ['post', '/api/scholarships/'.$scholarship->id.'/restore', RoleMatrix::SCHOLARSHIPS_EDIT],
        ['put', '/api/scholarships/'.$scholarship->id.'/criteria', RoleMatrix::CRITERIA_EDIT],
        ['post', '/api/scholarships/'.$scholarship->id.'/assignments', RoleMatrix::AWARDS_MANAGE],
        ['delete', '/api/assignments/'.$batch->id, RoleMatrix::AWARDS_MANAGE],
        ['patch', '/api/students/F24-BSCS-001', RoleMatrix::STUDENTS_EDIT],
        ['patch', '/api/awards/'.$award->id.'/components', RoleMatrix::AWARDS_MANAGE],
        ['post', '/api/awards/'.$award->id.'/revoke', RoleMatrix::AWARDS_MANAGE],
        ['post', '/api/applications/reject', RoleMatrix::APPLICATIONS_DECIDE],
        ['post', '/api/applications/'.$application->id.'/decision', RoleMatrix::APPLICATIONS_DECIDE],
        ['post', '/api/applications/'.$application->id.'/reopen', RoleMatrix::APPLICATIONS_DECIDE],
    ];
}

it('enforces the matrix on every guarded route, for every role', function (string $role) {
    $routes = guardedRoutes();
    actingAsRole($role);

    $wrong = [];

    foreach ($routes as [$method, $uri, $capability]) {
        $status = $this->json(strtoupper($method), $uri)->getStatusCode();
        $permitted = RoleMatrix::allows($role, $capability);

        if ($permitted && $status === 403) {
            $wrong[] = $role.' was refused '.$method.' '.$uri.' but holds '.$capability;
        }

        if (! $permitted && $status !== 403) {
            $wrong[] = $role.' got '.$status.' from '.$method.' '.$uri.' without '.$capability;
        }
    }

    expect($wrong)->toBe([]);
})->with(RoleMatrix::ROLES);

it('lets Data Entry correct a record but not decide what it is worth', function () {
    seedReferences();
    $scholarship = aScholarshipRecord();
    criteriaFor($scholarship->id);
    aStudent('F24-BSCS-001');
    $application = anApplication($scholarship->id, 'F24-BSCS-001');

    actingAsRole(RoleMatrix::DATA_ENTRY);

    // The separation roles.ts describes in a sentence: entering the numbers a
    // decision rests on and making the decision stay in different hands. So
    // the correction is allowed and everything downstream of it is not.
    $this->patchJson('/api/students/F24-BSCS-001', [
        'cgpa' => 3.1, 'reason' => 'Transcript correction',
    ])->assertOk();

    $this->postJson('/api/applications/'.$application->id.'/decision', [
        'outcome' => 'Rejected',
        'reason' => 'Income above the ceiling.',
    ])->assertForbidden();

    $this->putJson('/api/scholarships/'.$scholarship->id.'/criteria', [
        'maxMonthlyIncome' => 1,
        'minCreditHours' => 0,
        'minAttendancePct' => 0,
        'requiredDocuments' => [],
        'maxExistingCoveragePct' => 100,
        'autoRejectOn' => [],
        'cgpaThresholds' => [],
    ])->assertForbidden();
});

it('lets Reporting read everything and change nothing', function () {
    seedReferences();
    $scholarship = aScholarshipRecord();
    criteriaFor($scholarship->id);
    aStudent('F24-BSCS-001');
    anApplication($scholarship->id, 'F24-BSCS-001');

    actingAsRole(RoleMatrix::REPORTING);

    $this->getJson('/api/applications')->assertOk();
    $this->getJson('/api/students/F24-BSCS-001/coverage')->assertOk();
    $this->getJson('/api/reports/summary')->assertOk();
    $this->getJson('/api/audit')->assertOk();

    $this->postJson('/api/scholarships')->assertForbidden();
});

it('records the signed-in role in the audit trail, ignoring any role the client claims', function () {
    seedReferences();
    $scholarship = aScholarshipRecord();
    actingAsRole(RoleMatrix::ADMIN);

    // Restore only answers 200 for something actually archived, so archive it
    // first. The header is the point of the test either way.
    $this->postJson('/api/scholarships/'.$scholarship->id.'/archive', [
        'endExisting' => false,
        // A date rather than a term label: this test seeds only the references
        // it needs, and TermOrDate checks a label against the semesters table.
        'semester' => '2025-09-01',
    ])->assertOk();

    // X-Role was how the actor was decided before there were sessions. A client
    // that still sends it must not be able to sign somebody else's name to a
    // change.
    $this->withHeader('X-Role', RoleMatrix::SUPER_ADMIN)
        ->postJson('/api/scholarships/'.$scholarship->id.'/restore', ['reason' => 'Restored in error'])
        ->assertOk();

    expect(AuditEntry::latest('id')->first()->actor)->toBe(RoleMatrix::ADMIN);
});

/* -- Accounts ------------------------------------------------------------- */

it('seeds one working account per role', function () {
    $this->seed(UserSeeder::class);

    $users = User::query()->orderBy('email')->get();

    expect($users)->toHaveCount(count(RoleMatrix::ROLES))
        ->and($users->pluck('role')->sort()->values()->all())
        ->toBe(collect(RoleMatrix::ROLES)->sort()->values()->all());

    // Generated, not fixed: a seeder with a known password is the kind of thing
    // that survives to a staging box someone points at the internet.
    $entry = User::where('role', RoleMatrix::DATA_ENTRY)->firstOrFail();

    expect($entry->password)->not->toBe('password')
        ->and(strlen($entry->password))->toBeGreaterThan(30);
});

it('does not reset an existing account when seeded again', function () {
    $this->seed(UserSeeder::class);

    $before = User::where('role', RoleMatrix::ADMIN)->firstOrFail();

    $this->seed(UserSeeder::class);

    // firstOrCreate, so re-seeding never resets a password somebody is using
    // or re-grants a role somebody revoked.
    expect(User::count())->toBe(count(RoleMatrix::ROLES))
        ->and(User::where('role', RoleMatrix::ADMIN)->firstOrFail()->password)
        ->toBe($before->password);
});
