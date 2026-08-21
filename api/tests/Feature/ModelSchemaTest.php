<?php

declare(strict_types=1);

use App\Models\ApplicationDecision;
use App\Models\ApplicationDocument;
use App\Models\AssignmentBatch;
use App\Models\AuditEntry;
use App\Models\Award;
use App\Models\AwardComponent;
use App\Models\DomainEvent;
use App\Models\EligibilityCriteria;
use App\Models\FeeHead;
use App\Models\NeedApplication;
use App\Models\Revocation;
use App\Models\Scholarship;
use App\Models\ScholarshipRule;
use App\Models\Student;
use Illuminate\Database\Eloquent\Model as EloquentModel;
use Illuminate\Support\Facades\Schema;

/**
 * Every model checked against the schema it claims to map.
 *
 * 22 models were written from 12 migrations by hand, and the mistakes that
 * makes are all the same mistake: a column named slightly differently from the
 * migration. Eloquent does not notice. A cast on a column that does not exist
 * is silently ignored, a fillable entry that does not exist is silently
 * dropped, and both surface much later as an attribute that is mysteriously
 * always null.
 *
 * So this walks the models rather than testing any one of them. Anything added
 * in Phase 7 or later is covered the moment it is written.
 *
 * Each test gathers every problem before failing, rather than stopping at the
 * first. With 22 models, one-at-a-time would mean 22 runs to find 22 typos.
 *
 * Oracle folds unquoted identifiers to upper case, so every comparison here is
 * case-insensitive.
 */

/** @return list<class-string<EloquentModel>> */
function everyModel(): array
{
    $models = [];

    foreach (glob(app_path('Models/*.php')) as $file) {
        $class = 'App\\Models\\'.basename($file, '.php');

        if (! class_exists($class)) {
            continue;
        }

        $reflection = new ReflectionClass($class);

        if ($reflection->isAbstract() || ! $reflection->isSubclassOf(EloquentModel::class)) {
            continue;
        }

        $models[] = $class;
    }

    sort($models);

    return $models;
}

/** @return list<string> lower-cased column names for a model's table */
function columnsFor(string $class): array
{
    return array_map('strtolower', Schema::getColumnListing((new $class)->getTable()));
}

it('found every model, so the checks below are not vacuous', function () {
    expect(everyModel())->toHaveCount(23);
});

it('maps each model to a table that exists', function () {
    $missing = [];

    foreach (everyModel() as $class) {
        $table = (new $class)->getTable();

        if (! Schema::hasTable($table)) {
            $missing[] = $class.' -> '.$table;
        }
    }

    expect($missing)->toBe([]);
});

it('declares a primary key that is a real column', function () {
    $problems = [];

    foreach (everyModel() as $class) {
        $key = strtolower((new $class)->getKeyName());

        if (! in_array($key, columnsFor($class), true)) {
            $problems[] = $class.' primary key '.$key;
        }
    }

    expect($problems)->toBe([]);
});

it('casts only columns that exist', function () {
    $problems = [];

    foreach (everyModel() as $class) {
        $columns = columnsFor($class);

        foreach (array_keys((new $class)->getCasts()) as $attribute) {
            if (! in_array(strtolower($attribute), $columns, true)) {
                $problems[] = $class.' casts '.$attribute;
            }
        }
    }

    expect($problems)->toBe([]);
});

it('lists only columns that exist as fillable', function () {
    $problems = [];

    foreach (everyModel() as $class) {
        $columns = columnsFor($class);

        foreach ((new $class)->getFillable() as $attribute) {
            if (! in_array(strtolower($attribute), $columns, true)) {
                $problems[] = $class.' fills '.$attribute;
            }
        }
    }

    expect($problems)->toBe([]);
});

/**
 * The three Oracle-specific cast rules, enforced column by column.
 *
 * These go wrong silently rather than loudly: a NUMBER(1) read without a bool
 * cast is the integer 1, which is truthy either way until something compares it
 * with a strict operator. A CLOB read without an array cast is a JSON string
 * that json_decode was never called on.
 */
it('casts NUMBER(1) to bool, JSON CLOBs to array, and timestamptz to datetime', function () {
    $expected = [
        'boolean' => [
            [FeeHead::class, 'is_core'],
            [Scholarship::class, 'all_semesters'],
            [Scholarship::class, 'requires_reapplication'],
            [Scholarship::class, 'may_exceed_ceiling'],
            [Student::class, 'is_out_of_station'],
            [Student::class, 'financial_need_verified'],
            [Student::class, 'personal_statement_ok'],
            [Student::class, 'has_sports_medal'],
            [Student::class, 'bfit_member'],
            [AssignmentBatch::class, 'undone'],
            [Award::class, 'edited_by_hand'],
            [AwardComponent::class, 'is_overridden'],
            [NeedApplication::class, 'household_owns_vehicle'],
            [ApplicationDocument::class, 'verified'],
            [ApplicationDecision::class, 'automatic'],
        ],
        'array' => [
            [Scholarship::class, 'schools'],
            [Scholarship::class, 'programmes'],
            [Scholarship::class, 'batches'],
            [ScholarshipRule::class, 'weights'],
            [EligibilityCriteria::class, 'required_documents'],
            [EligibilityCriteria::class, 'auto_reject_on'],
            [AuditEntry::class, 'old_value'],
            [AuditEntry::class, 'new_value'],
            [DomainEvent::class, 'payload'],
        ],
        'datetime' => [
            [Revocation::class, 'at'],
            [AuditEntry::class, 'occurred_at'],
            [DomainEvent::class, 'at'],
            [NeedApplication::class, 'submitted_at'],
            [ApplicationDocument::class, 'uploaded_at'],
            [ApplicationDecision::class, 'at'],
        ],
    ];

    $problems = [];

    foreach ($expected as $cast => $pairs) {
        foreach ($pairs as [$class, $column]) {
            $actual = (new $class)->getCasts()[$column] ?? 'MISSING';

            if ($actual !== $cast) {
                $problems[] = $class.'::'.$column.' is '.$actual.', expected '.$cast;
            }
        }
    }

    expect($problems)->toBe([]);
});

/**
 * The reserved-word renames, which are the other thing a hand-written model
 * gets wrong, by using the name the domain uses rather than the one the column
 * has.
 */
it('uses the renamed columns, not the Oracle reserved words they replaced', function () {
    $batch = columnsFor(AssignmentBatch::class);
    $revocation = columnsFor(Revocation::class);
    $decision = columnsFor(ApplicationDecision::class);
    $audit = columnsFor(AuditEntry::class);

    expect($batch)->toContain('assignment_mode')
        ->and($batch)->not->toContain('mode')
        ->and($revocation)->toContain('revoked_by')
        ->and($revocation)->not->toContain('by')
        ->and($decision)->toContain('decided_by')
        ->and($decision)->not->toContain('by')
        ->and($audit)->toContain('occurred_at')
        ->and($audit)->not->toContain('timestamp');
});
