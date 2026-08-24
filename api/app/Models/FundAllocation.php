<?php

namespace App\Models;

use App\Models\Concerns\HasCanonicalUlids;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Received money assigned to one award.
 *
 * This is where "which donor is sponsoring which student" is answered, and it
 * answers through the award rather than the student: the award already names
 * the student, the scholarship, the amount and the term, so one hop gives the
 * mapping and its provenance, and donor money reconciles against fee relief
 * that demonstrably exists.
 *
 * Released rather than deleted, for the same reason a revoked award keeps its
 * row. The money was assigned to a student at a point in time, and reassigning
 * it later does not make that untrue.
 */
#[Fillable([
    'donation_id', 'award_id', 'amount', 'allocated_on', 'allocated_by',
    'reason', 'status', 'released_at', 'released_by', 'release_reason',
])]
class FundAllocation extends Model
{
    use HasCanonicalUlids;

    protected function casts(): array
    {
        return [
            'amount' => 'float',
            'allocated_on' => 'date',
            'released_at' => 'datetime',
        ];
    }

    /**
     * Only Active allocations count against a donation's balance. A released
     * one is history, and summing it would make the money look spent twice.
     */
    public function scopeActive(Builder $query): Builder
    {
        return $query->where('status', 'Active');
    }

    public function donation(): BelongsTo
    {
        return $this->belongsTo(Donation::class);
    }

    public function award(): BelongsTo
    {
        return $this->belongsTo(Award::class);
    }
}
