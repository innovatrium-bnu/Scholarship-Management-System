<?php

namespace App\Models;

use App\Models\Concerns\HasCanonicalUlids;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * The record of an award ending.
 *
 * Its own table rather than six nullable columns on awards, so it cannot be
 * half-filled: either a row exists and says when, why and on whose word, or the
 * award is live.
 *
 * semester is a real column because "how many students lost a scholarship last
 * semester" used to require regexing an English audit sentence. That is the
 * whole reason this table exists.
 *
 * revoked_by, not by: BY is an Oracle reserved word.
 */
#[Fillable([
    'award_id', 'at', 'effective_from', 'semester', 'timing',
    'cause', 'reason', 'revoked_by',
])]
class Revocation extends Model
{
    use HasCanonicalUlids;

    public $timestamps = false;

    protected function casts(): array
    {
        return [
            'at' => 'datetime',
            'effective_from' => 'date',
        ];
    }

    public function award(): BelongsTo
    {
        return $this->belongsTo(Award::class);
    }
}
