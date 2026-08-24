<?php

declare(strict_types=1);

use App\Auth\RoleMatrix;
use App\Models\Award;
use App\Models\Donation;
use App\Models\Donor;
use App\Models\FundAllocation;
use App\Models\Scholarship;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;

uses(RefreshDatabase::class);

/**
 * The defects the browser pass over this module found, stated as tests.
 *
 * Every one of them was live while 53 backend and 44 frontend donor tests were
 * green, which is the reason each is written down here rather than trusted to a
 * comment. Grouped because several are one mistake wearing different clothes:
 * a rule the browser enforced and the server did not, and a status filter
 * applied to a question that does not depend on status.
 *
 * The helpers come from DonorFundTest, which Pest loads alongside this file.
 */
beforeEach(function () {
    seedReferences();
    $this->withHeader('Origin', config('app.url'));
    actingAsRole(RoleMatrix::ADMIN);
});

/* -- A receipt settles an instalment only when it covers it ---------------- */

it('refuses a receipt that does not cover the instalment it names', function () {
    $donor = aDonorRow();
    $pledge = aPledgeRow($donor);
    $instalment = $pledge->instalments->firstWhere('sequence', 1);

    // One rupee against a million used to be accepted, and the whole instalment
    // then dropped out of receivable and out of overdue.
    $this->postJson("/api/donors/{$donor->id}/donations", [
        'amount' => 1,
        'receivedOn' => '2026-01-05',
        'method' => 'Cash',
        'pledgeId' => $pledge->id,
        'instalmentId' => $instalment->id,
    ])
        ->assertStatus(422)
        ->assertJsonValidationErrors('instalmentId');

    expect(Donation::count())->toBe(0);
});

it('refuses a receipt larger than the instalment it names', function () {
    // Settling is all-or-nothing, so an overpayment is not a settlement either;
    // it would leave the excess with nowhere to live.
    $donor = aDonorRow();
    $pledge = aPledgeRow($donor);
    $instalment = $pledge->instalments->firstWhere('sequence', 1);

    $this->postJson("/api/donors/{$donor->id}/donations", [
        'amount' => 1_500_000,
        'receivedOn' => '2026-01-05',
        'method' => 'Cash',
        'pledgeId' => $pledge->id,
        'instalmentId' => $instalment->id,
    ])
        ->assertStatus(422)
        ->assertJsonValidationErrors('instalmentId');
});

it('accepts a receipt for the exact instalment and clears it from receivable', function () {
    $donor = aDonorRow();
    $pledge = aPledgeRow($donor);
    $instalment = $pledge->instalments->firstWhere('sequence', 1);

    $before = $this->getJson('/api/funds/summary')->json('data.receivable');

    $this->postJson("/api/donors/{$donor->id}/donations", [
        'amount' => 1_000_000,
        'receivedOn' => '2026-01-05',
        'method' => 'Cash',
        'pledgeId' => $pledge->id,
        'instalmentId' => $instalment->id,
    ])->assertCreated();

    expect($this->getJson('/api/funds/summary')->json('data.receivable'))
        ->toBe($before - 1_000_000);
});

it('lets a part payment through and credits it against the schedule', function () {
    // The supported shape for a part payment: the pledge, no instalment. It
    // used to reduce receivable by nothing at all, because the only branch that
    // read receipts against the pledge total was the no-schedule fallback and
    // the write path always writes a schedule.
    $donor = aDonorRow();
    $pledge = aPledgeRow($donor);

    $before = $this->getJson('/api/funds/summary')->json('data.receivable');

    $this->postJson("/api/donors/{$donor->id}/donations", [
        'amount' => 250_000,
        'receivedOn' => '2026-01-05',
        'method' => 'Cash',
        'pledgeId' => $pledge->id,
    ])->assertCreated();

    expect($this->getJson('/api/funds/summary')->json('data.receivable'))
        ->toBe($before - 250_000);
});

/* -- Undoing a batch, and the allocation that outlives its release --------- */

it('refuses to undo a batch whose awards carry released donor money', function () {
    /*
     * The pre-check counted Active allocations only, and the foreign key does
     * not care about status. So releasing the money satisfied the money check
     * and the request went on to `$award->delete()`, which came back as a raw
     * ORA-02292 carrying the failing SQL and the database host.
     */
    $scholarship = aScholarshipRecord();
    aStudent('F24-BSCS-001');

    $this->postJson("/api/scholarships/{$scholarship->id}/assignments", [
        'mode' => 'Direct',
        'reason' => 'Test assignment',
        'picks' => [[
            'studentRegNo' => 'F24-BSCS-001',
            'components' => [[
                'feeHead' => 'Tuition',
                'entitlementKind' => 'Percentage',
                'entitlementValue' => 50,
                'entitlement' => 50,
                'applied' => 50,
            ]],
        ]],
    ])->assertCreated();

    $batchId = DB::table('assignment_batches')->value('id');
    $award = Award::firstOrFail();

    $donor = aDonorRow();
    $donation = aDonationRow($donor);

    $this->postJson("/api/donations/{$donation->id}/allocations", [
        'awardId' => $award->id,
        'amount' => 50_000,
        'reason' => 'Tuition support',
    ])->assertCreated();

    $allocation = FundAllocation::firstOrFail();

    $this->postJson("/api/allocations/{$allocation->id}/release", [
        'reason' => 'Reassigned after the committee met',
    ])->assertOk();

    expect(FundAllocation::firstOrFail()->status)->toBe('Released');

    $this->deleteJson("/api/assignments/{$batchId}")
        ->assertStatus(409)
        ->assertJsonPath('message', fn (string $message) => str_contains($message, 'released'));

    // Nothing deleted, and the batch is still marked as not undone. Oracle
    // returns the NUMBER(1) as a string, hence the loose comparison.
    expect(Award::count())->toBe(1)
        ->and((bool) DB::table('assignment_batches')->where('id', $batchId)->value('undone'))
        ->toBeFalse();
});

it('still refuses while the money is active, naming the amount', function () {
    $scholarship = aScholarshipRecord();
    aStudent('F24-BSCS-001');

    $this->postJson("/api/scholarships/{$scholarship->id}/assignments", [
        'mode' => 'Direct',
        'reason' => 'Test assignment',
        'picks' => [[
            'studentRegNo' => 'F24-BSCS-001',
            'components' => [[
                'feeHead' => 'Tuition',
                'entitlementKind' => 'Percentage',
                'entitlementValue' => 50,
                'entitlement' => 50,
                'applied' => 50,
            ]],
        ]],
    ])->assertCreated();

    $batchId = DB::table('assignment_batches')->value('id');
    $donor = aDonorRow();
    $donation = aDonationRow($donor);

    $this->postJson("/api/donations/{$donation->id}/allocations", [
        'awardId' => Award::firstOrFail()->id,
        'amount' => 50_000,
        'reason' => 'Tuition support',
    ])->assertCreated();

    $this->deleteJson("/api/assignments/{$batchId}")
        ->assertStatus(409)
        ->assertJsonPath('message', fn (string $message) => str_contains($message, '50,000.00'));
});

it('still undoes a batch that never carried donor money', function () {
    $scholarship = aScholarshipRecord();
    aStudent('F24-BSCS-001');

    $this->postJson("/api/scholarships/{$scholarship->id}/assignments", [
        'mode' => 'Direct',
        'reason' => 'Test assignment',
        'picks' => [[
            'studentRegNo' => 'F24-BSCS-001',
            'components' => [[
                'feeHead' => 'Tuition',
                'entitlementKind' => 'Percentage',
                'entitlementValue' => 50,
                'entitlement' => 50,
                'applied' => 50,
            ]],
        ]],
    ])->assertCreated();

    $this->deleteJson('/api/assignments/'.DB::table('assignment_batches')->value('id'))
        ->assertNoContent();

    expect(Award::count())->toBe(0);
});

/* -- A revoked award keeps its student on the allocation ------------------- */

it('carries the student and the award status on every allocation', function () {
    $donor = aDonorRow();
    $donation = aDonationRow($donor);
    $award = anAwardRow();

    $this->postJson("/api/donations/{$donation->id}/allocations", [
        'awardId' => $award->id,
        'amount' => 50_000,
        'reason' => 'Tuition support',
    ])->assertCreated();

    $allocation = $this->getJson("/api/donors/{$donor->id}")->json('data.donations.0.allocations.0');

    expect($allocation['studentRegNo'])->toBe('F24-BSCS-001')
        ->and($allocation['scholarshipId'])->toBe($award->scholarship_id)
        ->and($allocation['awardStatus'])->toBe('Active');
});

it('still names the student after the award is revoked', function () {
    /*
     * Every award list this system serves is active-only, so the donor page
     * resolved a revoked award to nothing and rendered "Unknown" against money
     * that was still assigned. Reading the student off the allocation is what
     * makes the donor-to-student map survive a revocation.
     */
    $donor = aDonorRow();
    $donation = aDonationRow($donor);
    $award = anAwardRow();

    $this->postJson("/api/donations/{$donation->id}/allocations", [
        'awardId' => $award->id,
        'amount' => 50_000,
        'reason' => 'Tuition support',
    ])->assertCreated();

    $this->postJson("/api/awards/{$award->id}/revoke", [
        'effective' => '2026-02-01',
        'timing' => 'immediate',
        'cause' => 'Revoked by hand',
        'reason' => 'Student withdrew',
    ])->assertCreated();

    $allocation = $this->getJson("/api/donors/{$donor->id}")->json('data.donations.0.allocations.0');

    expect($allocation['studentRegNo'])->toBe('F24-BSCS-001')
        ->and($allocation['awardStatus'])->toBe('Revoked');

    // And the money is still assigned — nothing auto-releases. json() hands
    // back an int for a whole number, so compare by value rather than by type.
    expect((float) $this->getJson('/api/funds/summary')->json('data.assigned'))
        ->toBe(50_000.0);
});

/* -- The donor link and the name it displays ------------------------------- */

it('keeps the donor name in step on a patch that never mentions the donor', function () {
    $donor = aDonorRow(['name' => 'Aslam Foundation']);
    $scholarship = aScholarshipRecord(1, [
        'funding_source' => 'Donor',
        'donor_id' => $donor->id,
        'donor_name' => 'Aslam Foundation',
    ]);

    // A client sending only a name used to slip past the sync, because the
    // guard tested the request for a donor id rather than the row.
    $this->patchJson("/api/scholarships/{$scholarship->id}", [
        'donorName' => 'Somebody Else Entirely',
        'reason' => 'Renaming the donor by hand',
    ])->assertOk();

    expect(Scholarship::find($scholarship->id)->donor_name)->toBe('Aslam Foundation');
});

it('leaves an unlinked scholarship free to name whoever it likes', function () {
    // The display fallback is still a free string when there is no link to
    // disagree with, which is what it was there for before donors existed.
    $scholarship = aScholarshipRecord(1, [
        'funding_source' => 'Donor',
        'donor_name' => 'An Unlinked Benefactor',
    ]);

    $this->patchJson("/api/scholarships/{$scholarship->id}", [
        'donorName' => 'A Different Benefactor',
        'reason' => 'Corrected the spelling',
    ])->assertOk();

    expect(Scholarship::find($scholarship->id)->donor_name)->toBe('A Different Benefactor');
});

/* -- Cancelling one pledge is not cancelling the donor's book -------------- */

it('records only the cancelled pledge, not everything the donor owes', function () {
    $donor = aDonorRow();
    $small = aPledgeRow($donor, ['total_amount' => 4_000_000]);
    aPledgeRow($donor, ['total_amount' => 4_000_000]);

    $this->postJson("/api/pledges/{$small->id}/cancel", [
        'reason' => 'The funding round fell through',
    ])->assertOk();

    // Both pledges are worth 4,000,000, so a figure of 8,000,000 would be the
    // donor's whole book rather than the pledge that was cancelled.
    expect((float) DB::table('domain_events')->where('kind', 'pledge.cancelled')->value('amount_pkr'))
        ->toBe(4_000_000.0);
});

/* -- Dates ----------------------------------------------------------------- */

it('keeps a pledge that starts on a leap day on the last day of February', function () {
    $donor = aDonorRow();

    $this->postJson("/api/donors/{$donor->id}/pledges", [
        'totalAmount' => 300_000,
        'termYears' => 3,
        'startsOn' => '2024-02-29',
        'reason' => 'Leap day commitment',
    ])->assertCreated();

    $pledge = $donor->pledges()->with('instalments')->firstOrFail();

    // strtotime('+1 years') on 29 February gives 1 March, which moved the whole
    // schedule a day later and never moved it back.
    expect($pledge->instalments->sortBy('sequence')->pluck('due_on')
        ->map(fn ($due) => $due->format('Y-m-d'))->all())
        ->toBe(['2024-02-29', '2025-02-28', '2026-02-28'])
        ->and($pledge->ends_on->format('Y-m-d'))->toBe('2027-02-28');
});

it('leaves an ordinary start date exactly where it was', function () {
    $donor = aDonorRow();

    $this->postJson("/api/donors/{$donor->id}/pledges", [
        'totalAmount' => 300_000,
        'termYears' => 3,
        'startsOn' => '2026-03-15',
        'reason' => 'Ordinary commitment',
    ])->assertCreated();

    $pledge = $donor->pledges()->with('instalments')->firstOrFail();

    expect($pledge->instalments->sortBy('sequence')->pluck('due_on')
        ->map(fn ($due) => $due->format('Y-m-d'))->all())
        ->toBe(['2026-03-15', '2027-03-15', '2028-03-15'])
        ->and($pledge->ends_on->format('Y-m-d'))->toBe('2029-03-15');
});
