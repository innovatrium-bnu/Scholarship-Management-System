<?php

namespace App\Models;

use App\Models\Concerns\HasCanonicalUlids;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOne;

/**
 * One dated expectation of money.
 *
 * A four-year commitment is four of these rather than one row with a duration,
 * because "what is still owed, and was it due yet" is what the receivables
 * figure answers and it cannot be answered without a date per instalment.
 *
 * There is no status column. Whether an instalment has been received is a fact
 * about whether a donation points at it, and storing it here as well would be a
 * second answer to the same question.
 */
#[Fillable(['pledge_id', 'sequence', 'amount', 'due_on'])]
class PledgeInstalment extends Model
{
    use HasCanonicalUlids;

    public $timestamps = false;

    protected function casts(): array
    {
        return [
            'sequence' => 'integer',
            'amount' => 'float',
            'due_on' => 'date',
        ];
    }

    public function pledge(): BelongsTo
    {
        return $this->belongsTo(Pledge::class);
    }

    /** The receipt that settled this instalment, if one has. */
    public function donation(): HasOne
    {
        return $this->hasOne(Donation::class, 'instalment_id');
    }
}
