<?php

declare(strict_types=1);

use App\Models\Concerns\NormalisesEmptyStrings;
use App\Models\Model;
use App\Models\User;

/**
 * The empty-string convention, pinned.
 *
 * Oracle stores '' as NULL and offers no way to opt out, so this application
 * decided to stop producing '' at all rather than pretend the two are
 * different. See App\Models\Concerns\NormalisesEmptyStrings for why the
 * nullable columns are the dangerous half.
 *
 * No database here on purpose. The point is that a model never holds a value
 * Oracle could not have stored, which is a fact about the model and is worth
 * checking without waiting for a schema.
 */

/** A stand-in for the Phase 6 models, so this tests the rule and not a table. */
function normalisingModel(): Model
{
    return new class extends Model
    {
        protected $guarded = [];
    };
}

describe('an empty string becomes null', function () {
    it('collapses one assigned directly', function () {
        $model = normalisingModel();
        $model->donor_name = '';

        expect($model->donor_name)->toBeNull();
    });

    it('collapses one that arrives through fill', function () {
        $model = normalisingModel()->fill(['donor_name' => '', 'name' => 'Ihsan Trust']);

        expect($model->donor_name)->toBeNull()
            ->and($model->name)->toBe('Ihsan Trust');
    });

    it('leaves the attribute genuinely null, not merely falsy', function () {
        $model = normalisingModel();
        $model->semester_till = '';

        // The distinction that matters: `where col = ''` matches nothing in
        // Oracle, so anything still holding '' would be unfindable.
        expect($model->getAttributes()['semester_till'])->toBeNull();
    });
});

describe('values that only look empty are left alone', function () {
    it('keeps the string zero', function () {
        $model = normalisingModel();
        $model->threshold = '0';

        expect($model->threshold)->toBe('0');
    });

    it('keeps integer zero and false', function () {
        $model = normalisingModel();
        $model->count = 0;
        $model->is_active = false;

        expect($model->count)->toBe(0)
            ->and($model->is_active)->toBeFalse();
    });

    it('keeps whitespace, which is a real varchar2 value', function () {
        $model = normalisingModel();
        $model->reason = ' ';

        expect($model->reason)->toBe(' ');
    });
});

describe('every model inherits the rule', function () {
    it('applies it through the base model', function () {
        expect(class_uses_recursive(normalisingModel()))
            ->toContain(NormalisesEmptyStrings::class);
    });

    it('applies it to User, which cannot extend the base model', function () {
        // User extends Authenticatable, so it opts in by hand. If that is ever
        // dropped this test is the only thing that would notice.
        expect(class_uses_recursive(User::class))
            ->toContain(NormalisesEmptyStrings::class);
    });
});
