<?php

declare(strict_types=1);

use App\Auth\RoleMatrix;
use App\Models\Scholarship;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

/**
 * What a role that cannot write may still read.
 *
 * Written because two screens were gated whole when only their controls needed
 * gating — the retired-scholarships listing and the priority order — and both
 * then refused Data Entry and Reporting a page the API was already serving
 * them. The client had become stricter than the server, which is the wrong
 * direction for a permission to drift: the server is the control, and a screen
 * that refuses what the server allows is withholding an answer rather than
 * protecting anything.
 *
 * So these tests state the split as a fact about the API. If a future change
 * puts `can:` middleware on either read route, the guards belong back on the
 * screens and this file fails first and says so.
 */
beforeEach(function () {
    seedReferences();
    $this->withHeader('Origin', config('app.url'));
});

/* -- The reads both read-only roles depend on ----------------------------- */

it('serves the scholarship list to every signed-in role, archived rows included', function (string $role) {
    aScholarshipRecord(1);
    aScholarshipRecord(2, ['name' => 'Retired Scholarship', 'status' => 'Archived']);

    actingAsRole($role);

    $response = $this->getJson('/api/scholarships')->assertOk();

    $names = collect($response->json('data'))->pluck('name')->all();

    // The retired one is the whole point: /scholarships/archived draws exactly
    // this row, and used to answer "You do not have permission for this" while
    // the endpoint behind it handed the row over without complaint.
    expect($names)->toContain('Retired Scholarship')
        ->and($names)->toContain('Merit Scholarship');
})->with([
    RoleMatrix::SUPER_ADMIN,
    RoleMatrix::ADMIN,
    RoleMatrix::DATA_ENTRY,
    RoleMatrix::REPORTING,
]);

it('tells every role which scholarship is paid first', function (string $role) {
    aScholarshipRecord(1, ['name' => 'Paid first']);
    aScholarshipRecord(2, ['name' => 'Paid second']);

    actingAsRole($role);

    $order = collect($this->getJson('/api/scholarships')->assertOk()->json('data'))
        ->sortBy('precedence')
        ->pluck('name')
        ->values()
        ->all();

    // Reporting is the role most likely to be asked why a student was paid 40%
    // rather than 60%, and the precedence order is where that answer is
    // written. It travels in the same payload for everybody.
    expect($order)->toBe(['Paid first', 'Paid second']);
})->with([
    RoleMatrix::SUPER_ADMIN,
    RoleMatrix::ADMIN,
    RoleMatrix::DATA_ENTRY,
    RoleMatrix::REPORTING,
]);

/* -- And the writes they must not reach ----------------------------------- */

it('refuses to let a read-only role rearrange the order', function (string $role) {
    $first = aScholarshipRecord(1, ['name' => 'Paid first']);
    $second = aScholarshipRecord(2, ['name' => 'Paid second']);

    actingAsRole($role);

    $this->putJson('/api/scholarships/precedence', [
        'order' => [$second->id, $first->id],
    ])->assertForbidden();

    expect(Scholarship::find($first->id)->precedence)->toBe(1);
})->with([RoleMatrix::DATA_ENTRY, RoleMatrix::REPORTING]);

it('refuses to let a read-only role bring a retired scholarship back', function (string $role) {
    $scholarship = aScholarshipRecord(1, ['status' => 'Archived']);

    actingAsRole($role);

    $this->postJson("/api/scholarships/{$scholarship->id}/restore", [
        'reason' => 'Should not be permitted',
    ])->assertForbidden();

    expect(Scholarship::find($scholarship->id)->status)->toBe('Archived');
})->with([RoleMatrix::DATA_ENTRY, RoleMatrix::REPORTING]);

it('still lets an Admin do both', function () {
    $first = aScholarshipRecord(1, ['name' => 'Paid first']);
    $second = aScholarshipRecord(2, ['name' => 'Paid second', 'status' => 'Archived']);

    actingAsRole(RoleMatrix::ADMIN);

    $this->postJson("/api/scholarships/{$second->id}/restore", ['reason' => 'Funding resumed'])
        ->assertOk();

    $this->putJson('/api/scholarships/precedence', [
        'order' => [$second->id, $first->id],
    ])->assertOk();

    // Reordering reindexes every row from zero rather than preserving whatever
    // numbering they had, so the assertion is 0 and 1 and not 1 and 2. Only the
    // relative order carries meaning -- lower is paid first -- and a total
    // rewrite is what keeps the sequence gapless after an insert or a retire.
    expect(Scholarship::find($second->id)->status)->toBe('Active')
        ->and(Scholarship::find($second->id)->precedence)->toBe(0)
        ->and(Scholarship::find($first->id)->precedence)->toBe(1);
});
