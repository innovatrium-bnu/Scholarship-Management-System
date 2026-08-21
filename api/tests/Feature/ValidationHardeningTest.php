<?php

declare(strict_types=1);

use App\Auth\RoleMatrix;
use App\Domain\Support\EnrollmentStatus;
use App\Domain\Support\RevocationCause;
use App\Models\Award;
use App\Models\Revocation;
use App\Models\Scholarship;
use App\Models\Student;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Testing\TestResponse;

uses(RefreshDatabase::class);

/**
 * The four defects found in the first manual test pass, and the rules that
 * close them.
 *
 * All four were reachable through a supported, authorised endpoint by a user
 * doing something ordinary, and none of them raised anything at the time. The
 * suite was fully green while every one of them was live, which is the reason
 * this file states each defect as a test rather than trusting a comment.
 *
 * Grouped in one file on purpose. They are four instances of two mistakes — a
 * closed set validated as a free string, and an identity taken from the client
 * — and reading them together is what makes the pattern visible to whoever adds
 * the next endpoint.
 */
beforeEach(function () {
    seedReferences();
    $this->withHeader('Origin', config('app.url'));
    actingAsRole(RoleMatrix::ADMIN);
});

/* -- DEF-01: enrollment status was a free string -------------------------- */

it('refuses an enrollment status that is not one of the four', function () {
    aStudent('F24-BSCS-001');

    // The exact request that returned 200 and stored the value.
    $response = $this->patchJson('/api/students/F24-BSCS-001', [
        'enrollmentStatus' => 'Abducted by aliens',
        'reason' => 'QA probe',
    ]);

    $response->assertStatus(422)->assertJsonValidationErrors('enrollmentStatus');

    expect(Student::find('F24-BSCS-001')->enrollment_status)->toBe('Enrolled');
});

it('accepts every status the domain recognises', function () {
    aStudent('F24-BSCS-001');

    foreach (EnrollmentStatus::ALL as $status) {
        $this->patchJson('/api/students/F24-BSCS-001', [
            'enrollmentStatus' => $status,
            'reason' => 'Status change',
        ])->assertOk();

        expect(Student::find('F24-BSCS-001')->enrollment_status)->toBe($status);
    }
});

it('is case sensitive about a status, because the filters are', function () {
    aStudent('F24-BSCS-001');

    // 'enrolled' is not 'Enrolled'. A row holding the lower-case form would be
    // missed by every screen that filters on the stored value.
    $this->patchJson('/api/students/F24-BSCS-001', [
        'enrollmentStatus' => 'enrolled',
        'reason' => 'QA probe',
    ])->assertStatus(422);
});

/* -- DEF-02 and DEF-04: a term or a date, and nothing else ---------------- */

it('refuses a revocation date that is neither a term nor a date', function () {
    $award = anActiveAward();

    // Previously reached Carbon and raised an unhandled exception: HTTP 500 on
    // a client mistake.
    $this->postJson('/api/awards/'.$award->id.'/revoke', [
        'effective' => 'not-a-date-at-all',
        'timing' => 'immediate',
        'cause' => 'Revoked by hand',
        'reason' => 'QA probe',
    ])->assertStatus(422)->assertJsonValidationErrors('effective');

    expect($award->fresh()->status)->toBe('Active')
        ->and(Revocation::count())->toBe(0);
});

it('refuses a date that matches the shape but is not a day', function () {
    $award = anActiveAward();

    // 2025-02-31 passes a regex and is not a date. Oracle would have taken it
    // as far as the bind before objecting.
    $this->postJson('/api/awards/'.$award->id.'/revoke', [
        'effective' => '2025-02-31',
        'timing' => 'immediate',
        'cause' => 'Revoked by hand',
        'reason' => 'QA probe',
    ])->assertStatus(422);
});

it('refuses a well-formed term the university does not have', function () {
    $award = anActiveAward();

    // ReportService groups by these labels. A term nothing else knows about is
    // a row that appears in no report.
    $this->postJson('/api/awards/'.$award->id.'/revoke', [
        'effective' => 'Autumn 2025',
        'timing' => 'immediate',
        'cause' => 'Revoked by hand',
        'reason' => 'QA probe',
    ])->assertStatus(422);
});

it('accepts both forms the writer normalises', function () {
    // A term label, as the review screen sends.
    $first = anActiveAward();

    $this->postJson('/api/awards/'.$first->id.'/revoke', [
        'effective' => 'Fall 2026',
        'timing' => 'immediate',
        'cause' => 'Revoked by hand',
        'reason' => 'Term form',
    ])->assertCreated();

    // An ISO date, as an imported record would carry.
    $second = anActiveAward();

    $this->postJson('/api/awards/'.$second->id.'/revoke', [
        'effective' => '2026-09-01',
        'timing' => 'immediate',
        'cause' => 'Revoked by hand',
        'reason' => 'Date form',
    ])->assertCreated();

    /*
     * Both normalise to the same stored pair, which is the whole point of
     * accepting either form.
     *
     * Fetched by award rather than ordered by reason: `reason` is a text
     * column, which on Oracle is a CLOB, and ORDER BY against one is
     * ORA-00932 rather than an ordering. Worth knowing before writing the
     * next query that sorts on a description.
     */
    $fromTerm = Revocation::where('award_id', $first->id)->firstOrFail();
    $fromDate = Revocation::where('award_id', $second->id)->firstOrFail();

    expect(Revocation::count())->toBe(2)
        ->and($fromTerm->semester)->toBe($fromDate->semester)
        ->and($fromTerm->effective_from->format('Y-m-d'))
        ->toBe($fromDate->effective_from->format('Y-m-d'));
});

it('refuses an archive term that is neither a term nor a date', function () {
    $scholarship = aScholarshipRecord();

    $this->postJson('/api/scholarships/'.$scholarship->id.'/archive', [
        'endExisting' => true,
        'semester' => 'not-a-term',
    ])->assertStatus(422)->assertJsonValidationErrors('semester');

    expect($scholarship->fresh()->status)->toBe('Active');
});

/* -- DEF-03: attribution comes from the session --------------------------- */

it('records the signed-in user as the revoker, ignoring anything the client claims', function () {
    $award = anActiveAward();

    $this->postJson('/api/awards/'.$award->id.'/revoke', [
        'effective' => 'Fall 2026',
        'timing' => 'immediate',
        'cause' => 'Revoked by hand',
        'reason' => 'QA probe',
        // The field the endpoint used to accept and store verbatim. It is no
        // longer read, and an un-updated client sending it must not break.
        'by' => 'Somebody Who Does Not Work Here',
    ])->assertCreated();

    $revocation = Revocation::firstOrFail();

    expect($revocation->revoked_by)->toBe(RoleMatrix::ADMIN)
        ->and($revocation->revoked_by)->not->toBe('Somebody Who Does Not Work Here');
});

it('keeps the revocation, the event and the audit line agreeing about who acted', function () {
    $award = anActiveAward();

    $this->postJson('/api/awards/'.$award->id.'/revoke', [
        'effective' => 'Fall 2026',
        'timing' => 'immediate',
        'cause' => 'Revoked by hand',
        'reason' => 'QA probe',
        'by' => 'Forged',
    ])->assertCreated();

    // Three records of one event. Before the fix the financial one was the
    // forgeable one, which is the worst of the three to be able to fake.
    $revocation = Revocation::firstOrFail();
    $event = DB::table('domain_events')->where('kind', 'award.revoked')->first();
    $audit = DB::table('audit_entries')->latest('occurred_at')->first();

    expect($revocation->revoked_by)->toBe(RoleMatrix::ADMIN)
        ->and(json_decode($event->payload, true)['actor'])->toBe(RoleMatrix::ADMIN)
        ->and($audit->actor)->toBe(RoleMatrix::ADMIN);
});

/* -- QA-09: three more closed sets that were free strings ----------------- */

it('refuses a revocation cause outside the four the domain names', function () {
    $award = anActiveAward();

    // The per-term gained/lost report groups by this column, so a value outside
    // the set is funding that stopped for a reason nothing counts.
    $this->postJson("/api/awards/{$award->id}/revoke", [
        'effective' => 'Fall 2026',
        'timing' => 'immediate',
        'cause' => 'Because I felt like it',
        'reason' => 'Test',
    ])->assertStatus(422)->assertJsonValidationErrors('cause');

    expect(Revocation::count())->toBe(0);
});

it('accepts every revocation cause the domain names', function () {
    foreach (RevocationCause::ALL as $cause) {
        $award = anActiveAward();

        $this->postJson("/api/awards/{$award->id}/revoke", [
            'effective' => 'Fall 2026',
            'timing' => 'immediate',
            'cause' => $cause,
            'reason' => 'Test',
        ])->assertCreated();
    }

    expect(Revocation::count())->toBe(count(RevocationCause::ALL));
});

it('refuses a household declaration outside the sets types.ts names', function () {
    $scholarship = aScholarshipRecord();
    aStudent('F24-BSCS-900');

    $this->postJson('/api/applications', [
        'studentRegNo' => 'F24-BSCS-900',
        'scholarshipId' => $scholarship->id,
        'semester' => 'Spring 2026',
        'submittedAt' => '2026-01-10',
        'statement' => 'We need help with tuition.',
        'requestedPct' => 50,
        'household' => [
            'monthlyIncome' => 40000,
            'earningMembers' => 1,
            'dependants' => 3,
            'siblingsAtBNU' => 0,
            'guardianOccupation' => 'Teacher',
            'guardianStatus' => 'Interdimensional cable repairman',
            'residence' => 'On the moon',
        ],
    ])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['household.guardianStatus', 'household.residence']);
});

/* -- QA-10: malformed input answered 500 rather than 422 ------------------ */

it('refuses a number JSON allows to be written but cannot represent', function () {
    aStudent('F24-BSCS-800');

    // Sent as a raw body rather than through patchJson(), because json_encode
    // refuses to encode INF -- which is the asymmetry the middleware exists
    // for. PHP will not write one and will happily read one, so the only way to
    // reproduce the request that raised a 500 is to write the literal by hand.
    rawJson($this, 'PATCH', '/api/students/F24-BSCS-800', '{"cgpa":1e400,"reason":"Test"}')
        ->assertStatus(422)
        ->assertJsonValidationErrors('cgpa');

    expect(Student::find('F24-BSCS-800')->cgpa)->toBe(3.4);
});

it('finds a non-finite number nested inside a payload and names where it is', function () {
    $scholarship = aScholarshipRecord();
    aStudent('F24-BSCS-801');

    $body = '{"mode":"Direct","reason":"Test","picks":[{"studentRegNo":"F24-BSCS-801",'
        .'"components":[{"feeHead":"Tuition","entitlementKind":"Percentage",'
        .'"entitlementValue":50,"entitlement":50,"applied":1e400}]}]}';

    // The path matters as much as the refusal: the message has to land next to
    // the input it belongs to, forty picks into a batch.
    rawJson($this, 'POST', "/api/scholarships/{$scholarship->id}/assignments", $body)
        ->assertStatus(422)
        ->assertJsonValidationErrors('picks.0.components.0.applied');
});

it('refuses a rule threshold that is neither a number nor a word', function () {
    // An array reached (string) in ruleColumns() and raised out of the cast;
    // `true` cast to "1", which the mapper reads back as the number 1 -- a CGPA
    // rule that silently passes every student.
    foreach ([[1, 2], ['a' => 1], true, false] as $threshold) {
        $this->postJson('/api/scholarships', [
            'name' => 'Threshold probe',
            'description' => 'Test',
            'studyLevel' => 'Bachelors',
            'batchMode' => 'all',
            'semesterFrom' => 'Spring 2026',
            'reviewCycle' => 'Annual',
            'maxDurationYears' => 1,
            'fundingSource' => 'Internal',
            'effectiveFrom' => '2026-01-01',
            'awardRules' => [[
                'kind' => 'Automatic',
                'field' => 'cgpa',
                'operator' => '>=',
                'threshold' => $threshold,
            ]],
        ])->assertStatus(422)->assertJsonValidationErrors('awardRules.0.threshold');
    }

    expect(Scholarship::where('name', 'Threshold probe')->count())->toBe(0);
});

it('still accepts the two forms a threshold is meant to take', function () {
    foreach ([3.5, '3.5', 'Distinction'] as $i => $threshold) {
        $this->postJson('/api/scholarships', [
            'name' => 'Threshold ok '.$i,
            'description' => 'Test',
            'studyLevel' => 'Bachelors',
            'batchMode' => 'all',
            'semesterFrom' => 'Spring 2026',
            'reviewCycle' => 'Annual',
            'maxDurationYears' => 1,
            'fundingSource' => 'Internal',
            'effectiveFrom' => '2026-01-01',
            'awardRules' => [[
                'kind' => 'Automatic',
                'field' => 'cgpa',
                'operator' => '>=',
                'threshold' => $threshold,
            ]],
        ])->assertCreated();
    }
});

/* -- QA-11: a no-op reported success and wrote a false audit line --------- */

it('refuses to archive a scholarship that is already archived', function () {
    $scholarship = aScholarshipRecord(1, ['status' => 'Archived']);

    $this->postJson("/api/scholarships/{$scholarship->id}/archive", [
        'endExisting' => false,
        'semester' => 'Fall 2026',
    ])->assertStatus(409);

    expect(auditActions())->not->toContain('Archived (no new awards)');
});

it('refuses to restore a scholarship that was never archived', function () {
    $scholarship = aScholarshipRecord();

    $this->postJson("/api/scholarships/{$scholarship->id}/restore", ['reason' => 'Test'])
        ->assertStatus(409);

    expect(auditActions())->not->toContain('Restored from archive');
});

it('refuses to reopen an application that has not been decided', function () {
    $scholarship = aScholarshipRecord();
    aStudent('F24-BSCS-700');
    $application = anApplication($scholarship->id, 'F24-BSCS-700');

    $this->postJson("/api/applications/{$application->id}/reopen", ['reason' => 'Test'])
        ->assertStatus(409);

    expect(auditActions())->not->toContain('Reopened application');
});

/* -- QA-13: identifiers in one case --------------------------------------- */

it('mints identifiers in the same case the seeder writes them', function () {
    // Oracle compares CHAR case-sensitively, so a row was findable only in the
    // case it happened to be written in. Uppercase is what the ULID
    // specification says and what the rows already in the database use.
    $scholarship = aScholarshipRecord();
    aStudent('F24-BSCS-600');
    $application = anApplication($scholarship->id, 'F24-BSCS-600');

    foreach ([$scholarship->id, $application->id] as $id) {
        expect($id)->toBe(strtoupper($id));
    }
});

/**
 * Send a request body exactly as written, without json_encode in the way.
 *
 * @return TestResponse
 */
function rawJson(object $test, string $method, string $uri, string $body)
{
    return $test->call($method, $uri, [], [], [], [
        'CONTENT_TYPE' => 'application/json',
        'HTTP_ACCEPT' => 'application/json',
    ], $body);
}

/**
 * Every audit action recorded so far, so a test can assert one was not written.
 *
 * @return list<string>
 */
function auditActions(): array
{
    return DB::table('audit_entries')->pluck('action')->all();
}

/* -- helpers -------------------------------------------------------------- */

function anActiveAward(): Award
{
    static $n = 0;
    $n++;

    $regNo = sprintf('F24-BSCS-%03d', $n);
    aStudent($regNo);
    $scholarship = aScholarshipRecord($n, ['name' => 'Award holder '.$n]);

    return Award::create([
        'student_reg_no' => $regNo,
        'scholarship_id' => $scholarship->id,
        'status' => 'Active',
        'effective_from' => '2025-09-01',
        'authorised_by' => RoleMatrix::ADMIN,
        'reason_code' => 'Initial award',
    ]);
}
