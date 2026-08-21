<?php

declare(strict_types=1);

use App\Models\AuditEntry;
use App\Models\FeeHead;
use App\Models\Scholarship;
use Illuminate\Support\Carbon;

/**
 * The casts, proved against Oracle rather than asserted about.
 *
 * ModelSchemaTest checks that the casts are declared on real columns. This
 * checks that they survive a write and a read, which is a different question
 * and the one that actually matters: Oracle has no boolean, no JSON type below
 * 21c, and fills a missing time zone from the session. Every one of those is a
 * chance for a value to come back as something other than it went in.
 */

/** The columns scholarships requires; the rest have defaults. */
function aScholarship(array $overrides = []): Scholarship
{
    return Scholarship::create(array_merge([
        'name' => 'Need-Based Scholarship',
        'description' => 'Half of tuition for students who qualify on need.',
        'study_level' => 'Bachelors',
        'precedence' => 1,
        'batch_mode' => 'all',
        'semester_from' => 'Spring 2026',
        'review_cycle' => 'Every semester',
        'max_duration_years' => 4,
        'funding_source' => 'Internal',
        'effective_from' => '2026-01-01',
    ], $overrides));
}

it('round-trips a NUMBER(1) as a real bool, not the integer 1', function () {
    $id = aScholarship(['may_exceed_ceiling' => true, 'requires_reapplication' => false])->id;

    $fresh = Scholarship::findOrFail($id);

    // The distinction the cast exists for: without it these are 1 and 0, which
    // are truthy and falsy but never identical to true and false.
    expect($fresh->may_exceed_ceiling)->toBe(true)
        ->and($fresh->requires_reapplication)->toBe(false);
});

it('round-trips a JSON CLOB as an array', function () {
    $schools = ['School of Computer & IT', 'School of Education'];

    $id = aScholarship(['schools' => $schools, 'programmes' => []])->id;

    $fresh = Scholarship::findOrFail($id);

    expect($fresh->schools)->toBe($schools)
        ->and($fresh->programmes)->toBe([])
        // Defaulted at the column, never assigned here, and still an array.
        ->and($fresh->batches)->toBe([]);
});

it('round-trips a timestamptz at the instant it was given, in UTC', function () {
    // The P5 case: Laravel binds a wall clock with no offset, and Oracle used
    // to complete it from whatever the session time zone happened to be.
    $at = Carbon::parse('2026-08-13 12:00:00', 'UTC');

    $id = AuditEntry::create([
        'entity_type' => 'Scholarship',
        'entity_id' => 'sch-need',
        'action' => 'created',
        'actor' => 'Registrar Office',
        'occurred_at' => $at,
    ])->id;

    $fresh = AuditEntry::findOrFail($id);

    expect($fresh->occurred_at)->toBeInstanceOf(Carbon::class)
        ->and($fresh->occurred_at->utc()->format('Y-m-d H:i:s'))->toBe('2026-08-13 12:00:00');
});

it('leaves a nullable JSON column null rather than turning it into an empty array', function () {
    $id = AuditEntry::create([
        'entity_type' => 'Award',
        'entity_id' => 'aw-1',
        'action' => 'revoked',
        'actor' => 'Finance',
        'occurred_at' => now(),
    ])->id;

    expect(AuditEntry::findOrFail($id)->old_value)->toBeNull();
});

it('stores an empty string as null, end to end', function () {
    // Phase 5's convention, against a real nullable column. Without the trait
    // this row would hold NULL while the model in memory held '' — and
    // `where donor_name = ''` would never find it either way.
    $scholarship = aScholarship(['donor_name' => '']);

    expect($scholarship->donor_name)->toBeNull();

    $fresh = Scholarship::findOrFail($scholarship->id);

    expect($fresh->donor_name)->toBeNull()
        ->and(Scholarship::whereNull('donor_name')->count())->toBe(1);
});

it('casts money to float, so it drops straight into the domain services', function () {
    // fee_head is a foreign key and RefreshDatabase leaves an empty database,
    // so the reference row has to exist before a coverage line can point at it.
    FeeHead::create(['name' => 'Tuition', 'is_core' => true]);

    $id = aScholarship()->id;

    $line = Scholarship::findOrFail($id)->coverageLines()->create([
        'fee_head' => 'Tuition',
        'benefit_kind' => 'Percentage',
        'value' => 50.0,
    ]);

    expect($line->fresh()->value)->toBe(50.0);
});
