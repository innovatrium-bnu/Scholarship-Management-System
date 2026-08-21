<?php

declare(strict_types=1);

use App\Models\ApplicationDecision;
use App\Models\AssignmentBatch;
use App\Models\AuditEntry;
use App\Models\Award;
use App\Models\AwardComponent;
use App\Models\DomainEvent;
use App\Models\FeeHead;
use App\Models\Revocation;
use App\Models\Scholarship;
use App\Models\Student;

/**
 * The HTTP surface the SPA will call.
 *
 * These check the two things a controller can get wrong that a unit test
 * cannot see: the shape that goes over the wire, and whether a write that
 * touches several tables leaves them agreeing with each other.
 */

/*
 * Every test here acts as Admin, which holds every capability an endpoint
 * names. That keeps these tests about the endpoints rather than about
 * permissions — AuthTest covers who may call what, and does it once per
 * capability instead of once per endpoint.
 */
beforeEach(fn () => actingAsRole());

/* -- Reads ---------------------------------------------------------------- */

it('serves reference data in the shape seed.ts exports', function () {
    seedReferences();

    $response = $this->getJson('/api/reference');

    $response->assertOk();

    // PROGRAMMES is keyed by school and GEOGRAPHY is nested, matching the
    // TypeScript constants these replace rather than the flat tables.
    expect($response->json('schools'))->toContain('School of Computer & IT')
        ->and($response->json('programmes.School of Computer & IT'))
        ->toContain('BS Computer Science')
        ->and($response->json('batches'))->toBe(['Fall 2023', 'Fall 2024'])
        ->and($response->json('feeHeads'))->toContain('Tuition');
});

it('returns scholarships in precedence order, not insertion order', function () {
    seedReferences();
    // Created out of order on purpose: the response must not echo it back.
    aScholarshipRecord(2, ['name' => 'Second']);
    aScholarshipRecord(0, ['name' => 'First']);
    aScholarshipRecord(1, ['name' => 'Middle']);

    $names = array_column($this->getJson('/api/scholarships')->json('data'), 'name');

    // The browser runs its own copy of the merge and takes the order it is
    // given, so any other order makes it compute different money.
    expect($names)->toBe(['First', 'Middle', 'Second']);
});

it('omits null optionals rather than sending JSON null', function () {
    seedReferences();
    aScholarshipRecord();

    $scholarship = $this->getJson('/api/scholarships')->json('data.0');

    // types.ts declares these as `donorName?: string`, which is
    // `string | undefined` and not `string | null`. Sending null would fail to
    // typecheck at every optional field the moment Phase 10 wires this up.
    expect($scholarship)->not->toHaveKey('donorName')
        ->not->toHaveKey('batchFrom')
        ->not->toHaveKey('semesterTill')
        // Present-and-false must survive: only null is absence.
        ->toHaveKey('requiresReapplication')
        ->and($scholarship['requiresReapplication'])->toBeFalse()
        ->and($scholarship['schools'])->toBe([]);
});

it('paginates the student register', function () {
    seedReferences();
    aStudent('F24-BSCS-001');
    aStudent('F24-BSCS-002');

    $response = $this->getJson('/api/students?perPage=1');

    $response->assertOk();

    expect($response->json('data'))->toHaveCount(1)
        ->and($response->json('meta.total'))->toBe(2)
        ->and($response->json('meta.lastPage'))->toBe(2);
});

it('searches the register by registration number and name', function () {
    seedReferences();
    aStudent('F24-BSCS-001');
    aStudent('F24-BSCS-777');

    $found = $this->getJson('/api/students?search=777')->json('data');

    expect($found)->toHaveCount(1)
        ->and($found[0]['regNo'])->toBe('F24-BSCS-777');
});

it('returns merged coverage for one student', function () {
    seedReferences();
    $scholarship = aScholarshipRecord();
    $scholarship->coverageLines()->create([
        'fee_head' => 'Tuition',
        'benefit_kind' => 'Percentage',
        'value' => 50,
    ]);
    aStudent('F24-BSCS-001');

    $award = Award::create([
        'student_reg_no' => 'F24-BSCS-001',
        'scholarship_id' => $scholarship->id,
        'status' => 'Active',
        'effective_from' => '2026-01-01',
        'authorised_by' => 'Registrar Office',
        'reason_code' => 'Merit',
    ]);
    $award->components()->create([
        'fee_head' => 'Tuition',
        'entitlement_kind' => 'Percentage',
        'entitlement_value' => 50,
        'entitlement' => 50,
        'applied' => 50,
        'is_overridden' => false,
    ]);

    $response = $this->getJson('/api/students/F24-BSCS-001/coverage');

    $response->assertOk();

    // 50% of a 200,000 tuition.
    expect($response->json('waiverValuePKR'))->toEqualMoney(100000.0)
        ->and($response->json('data'))->toHaveCount(1);
});

it('404s an unknown scholarship rather than returning an empty object', function () {
    $this->getJson('/api/scholarships/01ZZZZZZZZZZZZZZZZZZZZZZZZ')->assertNotFound();
});

/* -- Writes --------------------------------------------------------------- */

it('assigns a batch, creating awards, components and events together', function () {
    seedReferences();
    $scholarship = aScholarshipRecord();
    aStudent('F24-BSCS-001');
    aStudent('F24-BSCS-002');

    $payload = [
        'mode' => 'Evaluate',
        'reason' => 'Merit list for Spring 2026',
        'picks' => [
            ['studentRegNo' => 'F24-BSCS-001', 'components' => [[
                'feeHead' => 'Tuition', 'entitlementKind' => 'Percentage',
                'entitlementValue' => 50, 'entitlement' => 50, 'applied' => 50,
            ]]],
            ['studentRegNo' => 'F24-BSCS-002', 'components' => [[
                'feeHead' => 'Tuition', 'entitlementKind' => 'Percentage',
                'entitlementValue' => 25, 'entitlement' => 25, 'applied' => 25,
            ]]],
        ],
    ];

    $response = $this->postJson('/api/scholarships/'.$scholarship->id.'/assignments', $payload);

    $response->assertCreated();

    expect($response->json('data.awardIds'))->toHaveCount(2)
        ->and(Award::count())->toBe(2)
        ->and(AwardComponent::count())->toBe(2)
        ->and(DomainEvent::where('kind', 'award.granted')->count())->toBe(2)
        ->and(AuditEntry::where('entity_type', 'Batch')->count())->toBe(1);
});

it('undoes a batch, deleting its awards but keeping the batch', function () {
    seedReferences();
    $scholarship = aScholarshipRecord();
    aStudent('F24-BSCS-001');

    $batchId = $this->postJson('/api/scholarships/'.$scholarship->id.'/assignments', [
        'mode' => 'Direct',
        'reason' => 'Direct grant',
        'picks' => [['studentRegNo' => 'F24-BSCS-001', 'components' => [[
            'feeHead' => 'Tuition', 'entitlementKind' => 'Percentage',
            'entitlementValue' => 50, 'entitlement' => 50, 'applied' => 50,
        ]]]],
    ])->json('data.id');

    $this->deleteJson('/api/assignments/'.$batchId)->assertNoContent();

    expect(Award::count())->toBe(0)
        ->and(AssignmentBatch::find($batchId)->undone)->toBeTrue()
        ->and(DomainEvent::where('kind', 'award.undone')->count())->toBe(1);

    // Undoing twice is neither success nor a bad request.
    $this->deleteJson('/api/assignments/'.$batchId)->assertStatus(409);
});

it('approves an application and grants its award in one transaction', function () {
    seedReferences();
    $scholarship = aScholarshipRecord();
    criteriaFor($scholarship->id);
    aStudent('F24-BSCS-001');
    $application = anApplication($scholarship->id, 'F24-BSCS-001');

    $response = $this->postJson('/api/applications/'.$application->id.'/decision', [
        'outcome' => 'Approved',
        'reason' => 'Verified need.',
        'awardedPct' => 75,
    ]);

    $response->assertCreated();

    $award = Award::first();

    expect($award)->not->toBeNull()
        ->and($award->student_reg_no)->toBe('F24-BSCS-001')
        ->and($award->components->first()->entitlement_value)->toBe(75.0)
        ->and($application->fresh()->status)->toBe('Approved')
        ->and($response->json('data.awardId'))->toBe($award->id);
});

it('refuses to decide an application twice', function () {
    seedReferences();
    $scholarship = aScholarshipRecord();
    criteriaFor($scholarship->id);
    aStudent('F24-BSCS-001');
    $application = anApplication($scholarship->id, 'F24-BSCS-001');

    $this->postJson('/api/applications/'.$application->id.'/decision', [
        'outcome' => 'Rejected', 'reason' => 'Income above ceiling.',
    ])->assertCreated();

    $this->postJson('/api/applications/'.$application->id.'/decision', [
        'outcome' => 'Rejected', 'reason' => 'Income above ceiling.',
    ])->assertStatus(409);

    expect(ApplicationDecision::count())->toBe(1);
});

it('archives a scholarship and ends the awards hanging off it', function () {
    seedReferences();
    $scholarship = aScholarshipRecord();
    aStudent('F24-BSCS-001');

    $this->postJson('/api/scholarships/'.$scholarship->id.'/assignments', [
        'mode' => 'Direct',
        'reason' => 'Direct grant',
        'picks' => [['studentRegNo' => 'F24-BSCS-001', 'components' => [[
            'feeHead' => 'Tuition', 'entitlementKind' => 'Percentage',
            'entitlementValue' => 50, 'entitlement' => 50, 'applied' => 50,
        ]]]],
    ])->assertCreated();

    $response = $this->postJson('/api/scholarships/'.$scholarship->id.'/archive', [
        'endExisting' => true,
        'semester' => 'Fall 2026',
    ]);

    $response->assertOk();

    expect($response->json('awardsEnded'))->toBe(1)
        ->and($scholarship->fresh()->status)->toBe('Archived')
        ->and(Award::first()->status)->toBe('Revoked')
        ->and(Revocation::first()->semester)->toBe('Fall 2026')
        ->and(Revocation::first()->effective_from->format('Y-m-d'))->toBe('2026-09-01')
        ->and(DomainEvent::where('kind', 'award.revoked')->count())->toBe(1);
});

it('reorders precedence through a state that would break a plain unique index', function () {
    seedReferences();
    $first = aScholarshipRecord(0, ['name' => 'First']);
    $second = aScholarshipRecord(1, ['name' => 'Second']);
    $third = aScholarshipRecord(2, ['name' => 'Third']);

    // Reversing means rows pass through values other rows still hold. Only the
    // DEFERRABLE INITIALLY DEFERRED constraint makes that legal, and only
    // inside the writer transaction.
    $response = $this->putJson('/api/scholarships/precedence', [
        'order' => [$third->id, $second->id, $first->id],
    ]);

    $response->assertOk();

    expect(array_column($response->json('data'), 'name'))->toBe(['Third', 'Second', 'First'])
        ->and($third->fresh()->precedence)->toBe(0)
        ->and($first->fresh()->precedence)->toBe(2);
});

/* -- Validation ----------------------------------------------------------- */

it('rejects an assignment naming a student who does not exist', function () {
    seedReferences();
    $scholarship = aScholarshipRecord();

    $this->postJson('/api/scholarships/'.$scholarship->id.'/assignments', [
        'mode' => 'Evaluate',
        'reason' => 'Merit list',
        'picks' => [['studentRegNo' => 'NOBODY-001', 'components' => [[
            'feeHead' => 'Tuition', 'entitlementKind' => 'Percentage',
            'entitlementValue' => 50, 'entitlement' => 50, 'applied' => 50,
        ]]]],
    ])->assertStatus(422)->assertJsonValidationErrors('picks.0.studentRegNo');

    expect(Award::count())->toBe(0);
});

it('requires a donor name when the funding source is a donor', function () {
    seedReferences();

    $this->postJson('/api/scholarships', [
        'name' => 'Donor Scholarship',
        'description' => 'Funded externally.',
        'studyLevel' => 'Bachelors',
        'batchMode' => 'all',
        'semesterFrom' => 'Spring 2026',
        'reviewCycle' => 'Annual',
        'maxDurationYears' => 4,
        'fundingSource' => 'Donor',
        'effectiveFrom' => '2026-01-01',
    ])->assertStatus(422)->assertJsonValidationErrors('donorName');
});

it('requires a starting batch when the batch mode is onwards', function () {
    seedReferences();

    $this->postJson('/api/scholarships', [
        'name' => 'Onwards Scholarship',
        'description' => 'From one intake on.',
        'studyLevel' => 'Bachelors',
        'batchMode' => 'onwards',
        'semesterFrom' => 'Spring 2026',
        'reviewCycle' => 'Annual',
        'maxDurationYears' => 4,
        'fundingSource' => 'Internal',
        'effectiveFrom' => '2026-01-01',
    ])->assertStatus(422)->assertJsonValidationErrors('batchFrom');
});

it('refuses to delete a core fee head', function () {
    seedReferences();

    $this->deleteJson('/api/fee-heads/Tuition')->assertStatus(422);

    expect(FeeHead::find('Tuition'))->not->toBeNull();
});

it('refuses to delete a fee head an active scholarship covers', function () {
    seedReferences();
    FeeHead::create(['name' => 'Transport', 'is_core' => false]);
    aScholarshipRecord()->coverageLines()->create([
        'fee_head' => 'Transport',
        'benefit_kind' => 'Percentage',
        'value' => 10,
    ]);

    $this->deleteJson('/api/fee-heads/Transport')->assertStatus(422);
});

it('creates a scholarship at the end of the precedence order', function () {
    seedReferences();
    aScholarshipRecord(0, ['name' => 'Existing']);

    $this->postJson('/api/scholarships', [
        'name' => 'New Scholarship',
        'description' => 'Added later.',
        'studyLevel' => 'Both',
        'batchMode' => 'all',
        'semesterFrom' => 'Spring 2026',
        'reviewCycle' => 'Annual',
        'maxDurationYears' => 4,
        'fundingSource' => 'Internal',
        'effectiveFrom' => '2026-01-01',
    ])->assertCreated();

    // Last, not first: precedence is a claim on money, and a new scholarship
    // must not silently outrank every existing one.
    expect(Scholarship::where('name', 'New Scholarship')->first()->precedence)->toBe(1);
});

it('creates a scholarship with its coverage and rules in one request', function () {
    seedReferences();

    $response = $this->postJson('/api/scholarships', [
        'name' => 'Merit Scholarship',
        'description' => 'Half of tuition for a strong CGPA.',
        'studyLevel' => 'Bachelors',
        'batchMode' => 'all',
        'semesterFrom' => 'Spring 2026',
        'reviewCycle' => 'Every semester',
        'maxDurationYears' => 4,
        'fundingSource' => 'Internal',
        'effectiveFrom' => '2026-01-01',
        'coverage' => [
            ['feeHead' => 'Tuition', 'benefitKind' => 'Percentage', 'value' => 50],
            ['feeHead' => 'Hostel', 'benefitKind' => 'Full waiver', 'value' => 100],
        ],
        'awardRules' => [
            ['kind' => 'Automatic', 'field' => 'cgpa', 'operator' => '>=', 'threshold' => 3.5],
        ],
        'retentionRules' => [
            ['kind' => 'Manual', 'description' => 'Financial need verification'],
        ],
    ]);

    $response->assertCreated();

    expect($response->json('data.coverage'))->toHaveCount(2)
        ->and($response->json('data.awardRules'))->toHaveCount(1)
        ->and($response->json('data.retentionRules'))->toHaveCount(1)
        // Stored in a varchar2 and given its type back by the mapper, which is
        // what keeps the CGPA comparison running at all.
        ->and($response->json('data.awardRules.0.threshold'))->toBe(3.5);
});

it('replaces coverage wholesale, and leaves it alone when not sent', function () {
    seedReferences();
    $scholarship = aScholarshipRecord();
    $scholarship->coverageLines()->create([
        'fee_head' => 'Tuition', 'benefit_kind' => 'Percentage', 'value' => 50,
    ]);

    // A patch that does not mention coverage must not delete it.
    $this->patchJson('/api/scholarships/'.$scholarship->id, [
        'name' => 'Renamed', 'reason' => 'Correction',
    ])->assertOk();

    expect($scholarship->coverageLines()->count())->toBe(1);

    // A patch that does mention it replaces the whole set.
    $this->patchJson('/api/scholarships/'.$scholarship->id, [
        'reason' => 'New terms',
        'coverage' => [['feeHead' => 'Hostel', 'benefitKind' => 'Full waiver', 'value' => 100]],
    ])->assertOk();

    $lines = $scholarship->coverageLines()->get();

    expect($lines)->toHaveCount(1)
        ->and($lines->first()->fee_head)->toBe('Hostel');
});

/* -- The lists the store loads -------------------------------------------- */

it('serves the event log whole, for the dashboard to count from', function () {
    seedReferences();
    $scholarship = aScholarshipRecord();
    aStudent('F24-BSCS-001');

    $this->postJson('/api/scholarships/'.$scholarship->id.'/assignments', [
        'mode' => 'Direct',
        'reason' => 'Direct grant',
        'picks' => [['studentRegNo' => 'F24-BSCS-001', 'components' => [[
            'feeHead' => 'Tuition', 'entitlementKind' => 'Percentage',
            'entitlementValue' => 50, 'entitlement' => 50, 'applied' => 50,
        ]]]],
    ])->assertCreated();

    $events = $this->getJson('/api/events')->assertOk()->json('data');

    // Unpaginated on purpose: "how many awards were granted this year" cannot
    // be answered from one page of the answer.
    expect($events)->toHaveCount(1)
        ->and($events[0]['kind'])->toBe('award.granted')
        ->and($events[0]['semester'])->not->toBeNull();
});

it('serves every scholarship criteria in one request', function () {
    seedReferences();
    $first = aScholarshipRecord(0, ['name' => 'First']);
    $second = aScholarshipRecord(1, ['name' => 'Second']);
    criteriaFor($first->id);
    criteriaFor($second->id);

    $criteria = $this->getJson('/api/criteria')->assertOk()->json('data');

    expect($criteria)->toHaveCount(2)
        ->and(array_column($criteria, 'scholarshipId'))
        ->toContain($first->id)->toContain($second->id);
});

it('rebuilds a batch award list from the relation, so an undone batch reports none', function () {
    seedReferences();
    $scholarship = aScholarshipRecord();
    aStudent('F24-BSCS-001');

    $batchId = $this->postJson('/api/scholarships/'.$scholarship->id.'/assignments', [
        'mode' => 'Direct',
        'reason' => 'Direct grant',
        'picks' => [['studentRegNo' => 'F24-BSCS-001', 'components' => [[
            'feeHead' => 'Tuition', 'entitlementKind' => 'Percentage',
            'entitlementValue' => 50, 'entitlement' => 50, 'applied' => 50,
        ]]]],
    ])->json('data.id');

    expect($this->getJson('/api/assignments')->json('data.0.awardIds'))->toHaveCount(1);

    $this->deleteJson('/api/assignments/'.$batchId)->assertNoContent();

    $batches = $this->getJson('/api/assignments')->assertOk()->json('data');

    // The row survives so the history still shows it happened; its awards do
    // not, which is exactly why the list is not stored on the row.
    expect($batches)->toHaveCount(1)
        ->and($batches[0]['undone'])->toBeTrue()
        ->and($batches[0]['awardIds'])->toBe([]);
});

it('takes a student edit in camelCase, like every other endpoint', function () {
    seedReferences();
    aStudent('F24-BSCS-001', 3.0);

    $this->patchJson('/api/students/F24-BSCS-001', [
        'cgpa' => 3.75,
        'creditHours' => 18,
        'reason' => 'Transcript correction',
    ])->assertOk();

    $student = Student::findOrFail('F24-BSCS-001');

    expect($student->cgpa)->toBe(3.75)
        ->and($student->credit_hours)->toBe(18)
        // One audit entry per changed field, because appeals ask what a field
        // said before and who changed it.
        ->and(AuditEntry::where('entity_type', 'Student')->count())->toBe(2);
});

it('takes in an application through the intake door', function () {
    seedReferences();
    $scholarship = aScholarshipRecord();
    aStudent('F24-BSCS-001');

    $response = $this->postJson('/api/applications', [
        'studentRegNo' => 'F24-BSCS-001',
        'scholarshipId' => $scholarship->id,
        'semester' => 'Spring 2026',
        'submittedAt' => '2026-01-10T09:00:00Z',
        'statement' => 'We need help with tuition.',
        'requestedPct' => 50,
        'household' => [
            'monthlyIncome' => 40000,
            'earningMembers' => 1,
            'dependants' => 3,
            'siblingsAtBNU' => 0,
            'guardianOccupation' => 'Teacher',
            'guardianStatus' => 'Employed',
            'residence' => 'Rented',
        ],
        'documents' => [
            ['kind' => 'Income certificate', 'fileName' => 'income.pdf', 'uploadedAt' => '2026-01-10'],
        ],
    ]);

    $response->assertCreated();

    // toEqualMoney, not toBe: JSON has no int/float distinction, so a whole
    // float is decoded as an int here. In the browser both are `number`.
    expect($response->json('data.household.monthlyIncome'))->toEqualMoney(40000.0)
        ->and($response->json('data.documents'))->toHaveCount(1)
        ->and($response->json('data.status'))->toBe('Submitted')
        // No decision yet, and its absence is what "still in the queue" means.
        ->and($response->json('data'))->not->toHaveKey('decision');
});
