<?php

namespace App\Models;

use App\Models\Concerns\HasCanonicalUlids;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Money that actually arrived.
 *
 * The first record in this system of cash being received. Everything older is
 * fee relief — what the university does not collect — which is computed from
 * percentages and never received from anyone.
 *
 * instalment_id is unique, so two receipts cannot both claim to have settled
 * the same instalment. Without that the same money would be receivable and
 * received at once and the receivables figure would count it twice.
 *
 * recorded_by is server-derived. It is not accepted from a client, for the
 * reason a revocation endpoint had to stop accepting one: a caller-supplied
 * name on a money record is an attribution nobody can rely on.
 */
#[Fillable([
    'donor_id', 'pledge_id', 'instalment_id', 'amount', 'received_on',
    'method', 'reference', 'recorded_by', 'notes',
])]
class Donation extends Model
{
    use HasCanonicalUlids;

    protected function casts(): array
    {
        return [
            'amount' => 'float',
            'received_on' => 'date',
        ];
    }

    public function donor(): BelongsTo
    {
        return $this->belongsTo(Donor::class);
    }

    /** Null for an unsolicited gift, which arrives against no promise. */
    public function pledge(): BelongsTo
    {
        return $this->belongsTo(Pledge::class);
    }

    public function instalment(): BelongsTo
    {
        return $this->belongsTo(PledgeInstalment::class, 'instalment_id');
    }

    public function allocations(): HasMany
    {
        return $this->hasMany(FundAllocation::class);
    }
}
