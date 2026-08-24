<?php

declare(strict_types=1);

use App\Auth\RoleMatrix;
use App\Models\AssignmentBatch;
use App\Models\Award;
use App\Models\Donation;
use App\Models\Donor;
use App\Models\FundAllocation;
use App\Models\Pledge;
use App\Models\Scholarship;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;

uses(RefreshDatabase::class);

/**
 * The donors and funds module over HTTP.
 *
 * Two things are being checked and they fail differently. The shape that goes
 * over the wire — which the SPA typechecks against and which omits null keys —
 * and the guards, which are the only thing standing between this module and
 * money going missing quietly.
 *
 * The guards are the valuable half. Over-allocation, a receipt settling another
 * donor's instalment, and undoing a batch whose awards carry donor money are
 * each reachable by an authorised person doing something ordinary, and none of
 * them announces itself.
 */
beforeEach(function () {
    seedReferences();
    $this->withHeader('Origin', config('app.url'));
    actingAsRole(RoleMatrix::ADMIN);
});

/* -- helpers -------------------------------------------------------------- */

function aDonorRow(array $patch = []): Donor
{
    return Donor::create(array_merge([
        'name' => 'Aslam Foundation',
        'kind' => 'Organisation',
        'status' => 'Active',
    ], $patch));
}

function aPledgeRow(Donor $donor, array $patch = []): Pledge
{
    $pledge = Pledge::create(array_merge([
        'donor_id' => $donor->id,
        'total_amount' => 4000000,
        'term_years' => 4,
        'starts_on' => '2025-09-01',
        'ends_on' => '2029-09-01',
        'renewal_notice_days' => 90,
        'status' => 'Active',
    ], $patch));

    for ($n = 1; $n <= 4; $n++) {
        $pledge->instalments()->create([
            'sequence' => $n,
            'amount' => 1000000,
            'due_on' => (2024 + $n).'-09-01',
        ]);
    }

    return $pledge->fresh(['instalments']);
}

function aDonationRow(Donor $donor, array $patch = []): Donation
{
    return Donation::create(array_merge([
        'donor_id' => $donor->id,
        'amount' => 1000000,
        'received_on' => '2025-09-12',
        'method' => 'Bank transfer',
        'recorded_by' => 'Admin',
    ], $patch));
}

function anAwardRow(string $regNo = 'F24-BSCS-001'): Award
{
    aStudent($regNo);
    $scholarship = aScholarshipRecord(1, ['name' => 'Funded '.$regNo]);

    return Award::create([
        'student_reg_no' => $regNo,
        'scholarship_id' => $scholarship->id,
        'status' => 'Active',
        'effective_from' => '2025-09-01',
        'authorised_by' => RoleMatrix::ADMIN,
        'reason_code' => 'Initial award',
    ]);
}

/* -- the wire shape -------------------------------------------------------- */

it('serves donors, pledges, receipts and a rollup in one response', function () {
    $donor = aDonorRow();
    aPledgeRow($donor);
    aDonationRow($donor);

    $response = $this->getJson('/api/donors');

    $response->assertOk();

    expect($response->json('data.donors'))->toHaveCount(1)
        ->and($response->json('data.pledges'))->toHaveCount(1)
        ->and($response->json('data.donations'))->toHaveCount(1)
        ->and($response->json('data.funding'))->toHaveCount(1)
        // The server's today, so the browser cannot compute a different set of
        // overdue instalments from the same rows.
        ->and($response->json('data.asOf'))->toBe(now()->toDateString());
});

it('omits absent fields rather than sending null', function () {
    // types.ts writes optionals as `contactName?: string`, which is
    // `string | undefined` and not `string | null`. A null would fail to
    // typecheck at every optional field on the SPA.
    aDonorRow(['contact_name' => null, 'notes' => null]);

    $donor = $this->getJson('/api/donors')->json('data.donors.0');

    expect($donor)->not->toHaveKey('contactName')
        ->and($donor)->not->toHaveKey('notes')
        ->and($donor)->toHaveKey('name');
});

it('keeps cash and promises apart in the summary', function () {
    $donor = aDonorRow();
    aPledgeRow($donor);
    aDonationRow($donor, ['amount' => 250000]);

    $summary = $this->getJson('/api/funds/summary')->json('data');

    // The acceptance criterion. They are separate fields and nothing anywhere
    // adds them together.
    expect($summary['received'])->toEqual(250000)
        ->and($summary['receivable'])->toEqual(4000000)
        ->and($summary)->toHaveKey('unassigned')
        ->and($summary)->not->toHaveKey('total');
});

/* -- creating things -------------------------------------------------------- */

it('registers a donor and records both logs', function () {
    $response = $this->postJson('/api/donors', [
        'name' => 'Ravi Delta Trust',
        'kind' => 'Trust',
        'reason' => 'New funder onboarded',
    ]);

    $response->assertCreated();

    $donor = Donor::firstOrFail();

    expect($donor->name)->toBe('Ravi Delta Trust')
        ->and(DB::table('audit_entries')->where('entity_type', 'Donor')->count())->toBe(1)
        ->and(DB::table('domain_events')->where('kind', 'donor.registered')->count())->toBe(1)
        // The countable value is a column, not only a sentence.
        ->and(DB::table('domain_events')->where('kind', 'donor.registered')->value('donor_id'))
        ->toBe($donor->id);
});

it('refuses a second donor with the same name', function () {
    aDonorRow(['name' => 'Aslam Foundation']);

    // One organisation must be one row, or the module cannot answer what a
    // donor still owes. The unique index lands on the central ORA-00001 handler.
    $this->postJson('/api/donors', ['name' => 'Aslam Foundation', 'kind' => 'Trust'])
        ->assertStatus(409);
});

it('refuses a donor kind outside the set', function () {
    $this->postJson('/api/donors', ['name' => 'Somebody', 'kind' => 'Benefactor'])
        ->assertStatus(422)
        ->assertJsonValidationErrors('kind');
});

it('generates a yearly schedule that sums to the pledge exactly', function () {
    $donor = aDonorRow();

    // 1,000,000 over 3 years is 333,333.33 three times and 999,999.99. The
    // last instalment carries the remainder, or every three-year pledge is a
    // paisa short of itself forever.
    $this->postJson('/api/donors/'.$donor->id.'/pledges', [
        'totalAmount' => 1000000,
        'termYears' => 3,
        'startsOn' => '2025-09-01',
    ])->assertCreated();

    $pledge = Pledge::firstOrFail();
    $amounts = $pledge->instalments()->orderBy('sequence')->pluck('amount')->all();

    expect($amounts)->toBe([333333.33, 333333.33, 333333.34])
        ->and(array_sum($amounts))->toEqual(1000000.0)
        ->and($pledge->ends_on->format('Y-m-d'))->toBe('2028-09-01');
});

it('refuses a supplied schedule that does not add up', function () {
    $donor = aDonorRow();

    $this->postJson('/api/donors/'.$donor->id.'/pledges', [
        'totalAmount' => 1000000,
        'termYears' => 2,
        'startsOn' => '2025-09-01',
        'instalments' => [
            ['amount' => 400000, 'dueOn' => '2025-09-01'],
            ['amount' => 400000, 'dueOn' => '2026-09-01'],
        ],
    ])->assertStatus(422)->assertJsonValidationErrors('instalments');
});

it('refuses a receipt dated in the future', function () {
    $donor = aDonorRow();

    // A receipt records money that arrived. A future date is a pledge wearing
    // a receipt's clothes, and it would be counted as cash on hand.
    $this->postJson('/api/donors/'.$donor->id.'/donations', [
        'amount' => 100000,
        'receivedOn' => now()->addDay()->toDateString(),
        'method' => 'Bank transfer',
    ])->assertStatus(422)->assertJsonValidationErrors('receivedOn');
});

it('refuses a receipt settling another pledge\'s instalment', function () {
    $first = aDonorRow(['name' => 'First Trust']);
    $second = aDonorRow(['name' => 'Second Trust']);

    $theirs = aPledgeRow($second);
    $mine = aPledgeRow($first);

    // Rule::exists proves the instalment is real, not that it belongs here.
    // Without the check that instalment silently drops off the receivables.
    $this->postJson('/api/donors/'.$first->id.'/donations', [
        'amount' => 1000000,
        'receivedOn' => '2025-09-12',
        'method' => 'Cheque',
        'pledgeId' => $mine->id,
        'instalmentId' => $theirs->instalments->first()->id,
    ])->assertStatus(422)->assertJsonValidationErrors('instalmentId');
});

/* -- the guards -------------------------------------------------------------- */

it('assigns money to an award and records who and where', function () {
    $donor = aDonorRow();
    $donation = aDonationRow($donor);
    $award = anAwardRow();

    $this->postJson('/api/donations/'.$donation->id.'/allocations', [
        'awardId' => $award->id,
        'amount' => 350000,
        'reason' => 'Tuition support',
    ])->assertCreated();

    $allocation = FundAllocation::firstOrFail();
    $event = DB::table('domain_events')->where('kind', 'funds.allocated')->first();

    expect($allocation->amount)->toEqual(350000.0)
        ->and($allocation->allocated_by)->toBe(RoleMatrix::ADMIN)
        // The student and the amount are columns on the event, because the
        // award row is deletable and the sponsorship trail must outlive it.
        ->and($event->student_reg_no)->toBe('F24-BSCS-001')
        ->and((float) $event->amount_pkr)->toEqual(350000.0)
        ->and($event->donor_id)->toBe($donor->id);
});

it('refuses to assign more than the receipt still holds', function () {
    $donor = aDonorRow();
    $donation = aDonationRow($donor, ['amount' => 500000]);
    $award = anAwardRow();

    $this->postJson('/api/donations/'.$donation->id.'/allocations', [
        'awardId' => $award->id, 'amount' => 400000, 'reason' => 'First',
    ])->assertCreated();

    // 409, not 422: the amount is well formed, the balance is not there.
    $this->postJson('/api/donations/'.$donation->id.'/allocations', [
        'awardId' => anAwardRow('F24-BSCS-002')->id, 'amount' => 200000, 'reason' => 'Second',
    ])->assertStatus(409);

    expect(FundAllocation::count())->toBe(1);
});

it('lets a released allocation free the money again', function () {
    $donor = aDonorRow();
    $donation = aDonationRow($donor, ['amount' => 500000]);
    $award = anAwardRow();

    $this->postJson('/api/donations/'.$donation->id.'/allocations', [
        'awardId' => $award->id, 'amount' => 500000, 'reason' => 'All of it',
    ])->assertCreated();

    $allocation = FundAllocation::firstOrFail();

    $this->postJson('/api/allocations/'.$allocation->id.'/release', [
        'reason' => 'Reassigned to a student in greater need.',
    ])->assertOk();

    expect($allocation->fresh()->status)->toBe('Released')
        ->and($allocation->fresh()->released_by)->toBe(RoleMatrix::ADMIN);

    // The money is spendable again, which is the whole point of releasing
    // rather than deleting.
    $this->postJson('/api/donations/'.$donation->id.'/allocations', [
        'awardId' => anAwardRow('F24-BSCS-002')->id, 'amount' => 500000, 'reason' => 'Elsewhere',
    ])->assertCreated();
});

it('refuses to release an allocation twice', function () {
    $donor = aDonorRow();
    $donation = aDonationRow($donor);
    $award = anAwardRow();

    $this->postJson('/api/donations/'.$donation->id.'/allocations', [
        'awardId' => $award->id, 'amount' => 100000, 'reason' => 'Support',
    ])->assertCreated();

    $allocation = FundAllocation::firstOrFail();

    $this->postJson('/api/allocations/'.$allocation->id.'/release', ['reason' => 'Once'])->assertOk();
    $this->postJson('/api/allocations/'.$allocation->id.'/release', ['reason' => 'Twice'])->assertStatus(409);
});

it('refuses to assign money to a revoked award', function () {
    $donor = aDonorRow();
    $donation = aDonationRow($donor);
    $award = anAwardRow();
    $award->update(['status' => 'Revoked']);

    $this->postJson('/api/donations/'.$donation->id.'/allocations', [
        'awardId' => $award->id, 'amount' => 100000, 'reason' => 'Support',
    ])->assertStatus(409);
});

it('refuses to archive a donor who still owes money', function () {
    $donor = aDonorRow();
    aPledgeRow($donor);

    // Archiving would take the donor out of the pickers and their outstanding
    // instalments with them, quietly reducing receivables by an amount nobody
    // wrote off.
    $this->postJson('/api/donors/'.$donor->id.'/archive', ['reason' => 'Dormant'])
        ->assertStatus(409);

    expect($donor->fresh()->status)->toBe('Active');
});

it('archives a donor whose money has all arrived and been spent', function () {
    $donor = aDonorRow();

    $this->postJson('/api/donors/'.$donor->id.'/archive', ['reason' => 'No longer funding'])
        ->assertOk();

    expect($donor->fresh()->status)->toBe('Archived');
});

it('refuses to undo a batch whose awards carry donor money', function () {
    // The sharpest interaction with what came before. Undoing a batch deletes
    // its awards, and an allocation points at one with restrictOnDelete — so
    // without the guard this is ORA-02292 surfacing as a 500 from a feature
    // with no visible connection to donors.
    $donor = aDonorRow();
    $donation = aDonationRow($donor);
    $award = anAwardRow();

    $batchModel = AssignmentBatch::create([
        'scholarship_id' => $award->scholarship_id,
        'actor' => RoleMatrix::ADMIN,
        'reason' => 'Batch assignment',
        'assignment_mode' => 'Direct',
    ]);

    $award->update(['batch_id' => $batchModel->id]);

    $this->postJson('/api/donations/'.$donation->id.'/allocations', [
        'awardId' => $award->id, 'amount' => 250000, 'reason' => 'Support',
    ])->assertCreated();

    $this->deleteJson('/api/assignments/'.$batchModel->id)->assertStatus(409);

    expect(Award::find($award->id))->not->toBeNull()
        ->and($batchModel->fresh()->undone)->toBeFalse();
});

it('undoes a batch whose awards carry no donor money', function () {
    $award = anAwardRow();

    $batchModel = AssignmentBatch::create([
        'scholarship_id' => $award->scholarship_id,
        'actor' => RoleMatrix::ADMIN,
        'reason' => 'Batch assignment',
        'assignment_mode' => 'Direct',
    ]);

    $award->update(['batch_id' => $batchModel->id]);

    $this->deleteJson('/api/assignments/'.$batchModel->id)->assertNoContent();

    expect(Award::find($award->id))->toBeNull();
});

/* -- linking a scholarship to a donor --------------------------------------- */

it('takes the donor name from the donor record when one is linked', function () {
    $donor = aDonorRow(['name' => 'Ravi Delta Trust']);

    // The client sends a name that disagrees with the record. There is one
    // source of truth for a donor's name, and it is the donor.
    $this->postJson('/api/scholarships', [
        'name' => 'Ravi Delta Award',
        'description' => 'Funded from outside.',
        'studyLevel' => 'Bachelors',
        'batchMode' => 'all',
        'semesterFrom' => 'Spring 2026',
        'reviewCycle' => 'Annual',
        'maxDurationYears' => 4,
        'fundingSource' => 'Donor',
        'donorName' => 'Something Else Entirely',
        'donorId' => $donor->id,
        'effectiveFrom' => '2026-01-01',
        'reason' => 'New donor-funded award',
    ])->assertCreated();

    $scholarship = Scholarship::where('name', 'Ravi Delta Award')->firstOrFail();

    expect($scholarship->donor_id)->toBe($donor->id)
        ->and($scholarship->donor_name)->toBe('Ravi Delta Trust');
});

it('leaves an unlinked donor-funded scholarship exactly as it was', function () {
    // A client that has never heard of donors must behave as it did before,
    // which is what makes the link additive rather than a breaking change.
    $this->postJson('/api/scholarships', [
        'name' => 'Unlinked Award',
        'description' => 'Funded from outside, donor not yet on record.',
        'studyLevel' => 'Bachelors',
        'batchMode' => 'all',
        'semesterFrom' => 'Spring 2026',
        'reviewCycle' => 'Annual',
        'maxDurationYears' => 4,
        'fundingSource' => 'Donor',
        'donorName' => 'A Trust We Have Not Registered',
        'effectiveFrom' => '2026-01-01',
        'reason' => 'Recorded ahead of the donor',
    ])->assertCreated();

    $scholarship = Scholarship::where('name', 'Unlinked Award')->firstOrFail();

    expect($scholarship->donor_id)->toBeNull()
        ->and($scholarship->donor_name)->toBe('A Trust We Have Not Registered');
});

it('refuses a donor id that is not a donor', function () {
    $this->postJson('/api/scholarships', [
        'name' => 'Bad Link',
        'description' => 'x',
        'studyLevel' => 'Bachelors',
        'batchMode' => 'all',
        'semesterFrom' => 'Spring 2026',
        'reviewCycle' => 'Annual',
        'maxDurationYears' => 4,
        'fundingSource' => 'Donor',
        'donorName' => 'x',
        'donorId' => '01ZZZZZZZZZZZZZZZZZZZZZZZZ',
        'effectiveFrom' => '2026-01-01',
    ])->assertStatus(422)->assertJsonValidationErrors('donorId');
});
