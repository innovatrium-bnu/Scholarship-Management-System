<?php

namespace App\Models;

use App\Models\Concerns\HasCanonicalUlids;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * The decision on an application. One row at most, and only once decided.
 *
 * Approving creates the award in the same transaction, and award_id is what
 * ties the two together afterwards. It is nullOnDelete rather than cascade: if
 * that award is later undone the decision still happened.
 *
 * decided_by, not by: BY is an Oracle reserved word.
 */
#[Fillable([
    'application_id', 'outcome', 'decided_by', 'role', 'at',
    'reason', 'automatic', 'awarded_pct', 'award_id',
])]
class ApplicationDecision extends Model
{
    use HasCanonicalUlids;

    public $timestamps = false;

    protected function casts(): array
    {
        return [
            'at' => 'datetime',
            'automatic' => 'boolean',
            'awarded_pct' => 'float',
        ];
    }

    public function application(): BelongsTo
    {
        return $this->belongsTo(NeedApplication::class, 'application_id');
    }

    public function award(): BelongsTo
    {
        return $this->belongsTo(Award::class);
    }
}
